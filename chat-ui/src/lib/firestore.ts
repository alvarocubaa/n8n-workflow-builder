import admin from 'firebase-admin';
import { randomUUID } from 'crypto';

// ─── In-memory fallback for local-* conversations (no Firestore) ─────────────
// Used when Firestore is unavailable and IDs are prefixed with "local-".
// Survives within the same Node.js process (fine for local dev).

interface LocalConv {
  title: string;
  messages: DisplayMessage[];
}
const localStore = new Map<string, LocalConv>();

// ─── Firebase initialisation ─────────────────────────────────────────────────

function getDb(): admin.firestore.Firestore {
  if (!admin.apps.length) {
    admin.initializeApp();
  }
  return admin.firestore();
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DisplayMessage {
  role: 'user' | 'model';
  content: string;
  timestamp: string; // ISO 8601
}

export interface ConversationSummary {
  id: string;
  title: string;
  updatedAt: string; // ISO 8601
}

export interface Conversation {
  id: string;
  title: string;
  departmentId?: string;
  messages: DisplayMessage[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function userRef(userEmail: string) {
  return getDb().collection('users').doc(userEmail);
}

function convRef(userEmail: string, conversationId: string) {
  return userRef(userEmail).collection('conversations').doc(conversationId);
}

/** Returns true when Firestore is unavailable or credentials are invalid (local dev). */
function isFirestoreUnavailable(err: unknown): boolean {
  const code = (err as { code?: number })?.code;
  return (
    code === 2  /* UNKNOWN — covers RAPT/invalid_grant credential errors */ ||
    code === 5  /* NOT_FOUND */ ||
    code === 7  /* PERMISSION_DENIED */ ||
    code === 16 /* UNAUTHENTICATED */
  );
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Create a new conversation. Returns the new conversation ID.
 * Falls back to a local UUID if Firestore is not available.
 */
export async function createConversation(
  userEmail: string,
  firstMessage: string,
  departmentId?: string,
): Promise<string> {
  const title =
    firstMessage.length > 60
      ? firstMessage.substring(0, 57) + '...'
      : firstMessage;

  try {
    const now = admin.firestore.FieldValue.serverTimestamp();
    const ref = await userRef(userEmail)
      .collection('conversations')
      .add({
        title,
        departmentId: departmentId ?? 'cx',
        createdAt: now,
        updatedAt: now,
        messages: [],
      });
    return ref.id;
  } catch (err) {
    if (isFirestoreUnavailable(err)) {
      // No Firestore yet — store in-memory so multi-turn works locally
      const id = `local-${randomUUID()}`;
      localStore.set(id, { title, messages: [] });
      return id;
    }
    throw err;
  }
}

/**
 * Append messages to a conversation and update the updatedAt timestamp.
 * Silently skips if Firestore is not available or the conversation ID is local.
 */
export async function appendMessages(
  userEmail: string,
  conversationId: string,
  messages: DisplayMessage[]
): Promise<void> {
  // Local IDs: persist in-memory so follow-up turns have history
  if (conversationId.startsWith('local-')) {
    const conv = localStore.get(conversationId);
    if (conv) {
      conv.messages.push(...messages);
      if (conv.messages.length > 100) conv.messages = conv.messages.slice(-100);
    }
    return;
  }

  try {
    const ref = convRef(userEmail, conversationId);
    const snap = await ref.get();
    const existing: DisplayMessage[] = snap.exists
      ? (snap.data()?.messages as DisplayMessage[]) ?? []
      : [];

    const combined = [...existing, ...messages];
    // Keep at most 100 messages to stay well within the 1MB Firestore doc limit
    const trimmed = combined.length > 100 ? combined.slice(-100) : combined;

    await ref.set(
      {
        messages: trimmed,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  } catch (err) {
    if (isFirestoreUnavailable(err)) return; // silently skip
    throw err;
  }
}

/**
 * Load a single conversation (title + messages).
 * Returns null if Firestore is unavailable or ID is local.
 */
export async function getConversation(
  userEmail: string,
  conversationId: string
): Promise<Conversation | null> {
  if (conversationId.startsWith('local-')) {
    const conv = localStore.get(conversationId);
    return conv ? { id: conversationId, title: conv.title, messages: conv.messages } : null;
  }

  try {
    const snap = await convRef(userEmail, conversationId).get();
    if (!snap.exists) return null;

    const data = snap.data()!;
    return {
      id: snap.id,
      title: data.title as string,
      departmentId: (data.departmentId as string) ?? undefined,
      messages: (data.messages as DisplayMessage[]) ?? [],
    };
  } catch (err) {
    if (isFirestoreUnavailable(err)) return null;
    throw err;
  }
}

/**
 * List all conversations for a user, most recent first.
 * Returns an empty array if Firestore is not available.
 */
export async function listConversations(
  userEmail: string
): Promise<ConversationSummary[]> {
  try {
    const snap = await userRef(userEmail)
      .collection('conversations')
      .orderBy('updatedAt', 'desc')
      .limit(50)
      .get();

    return snap.docs.map(doc => {
      const data = doc.data();
      const updatedAt =
        data.updatedAt instanceof admin.firestore.Timestamp
          ? data.updatedAt.toDate().toISOString()
          : new Date().toISOString();

      return {
        id: doc.id,
        title: data.title as string,
        updatedAt,
      };
    });
  } catch (err) {
    if (isFirestoreUnavailable(err)) return [];
    throw err;
  }
}
