import admin from 'firebase-admin';
import { randomUUID } from 'crypto';
import type { AnalyticsEvent, AssistantMode, DeployEvent, FeedbackEntry } from './types';

// ─── In-memory fallback for local-* conversations (no Firestore) ─────────────
// Used when Firestore is unavailable and IDs are prefixed with "local-".
// Survives within the same Node.js process (fine for local dev).

// Direction-3: explicit source of the conversation. Set once on creation,
// immutable thereafter. Hub-write callbacks (n8n-conversation-callback /
// n8n-builder-callback) reject 'standalone' rows defensively. See
// docs/direction-3-design.md.
export type ConversationSource = 'standalone' | 'hub_prefill' | 'hub_embed';

interface LocalConv {
  title: string;
  mode: AssistantMode;
  messages: DisplayMessage[];
  initiativeId?: string;
  initiativeMode?: 'planning' | 'building';
  source?: ConversationSource;
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
  toolContext?: string; // compact summary of tools called this turn (specs, skills, nodes)
}

export interface ConversationSummary {
  id: string;
  title: string;
  mode?: AssistantMode;
  updatedAt: string; // ISO 8601
}

export interface Conversation {
  id: string;
  title: string;
  departmentId?: string;
  mode?: AssistantMode;
  messages: DisplayMessage[];
  initiativeId?: string;
  initiativeMode?: 'planning' | 'building';
  source?: ConversationSource;
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
  mode?: AssistantMode,
  initiativeId?: string,
  initiativeMode?: 'planning' | 'building',
  source: ConversationSource = 'standalone',
): Promise<string> {
  const title =
    firstMessage.length > 60
      ? firstMessage.substring(0, 57) + '...'
      : firstMessage;

  try {
    const now = admin.firestore.FieldValue.serverTimestamp();
    const docPayload: Record<string, unknown> = {
      title,
      departmentId: departmentId ?? 'cx',
      mode: mode ?? 'builder',
      createdAt: now,
      updatedAt: now,
      messages: [],
      source,
    };
    if (initiativeId) {
      docPayload.initiativeId = initiativeId;
      docPayload.initiativeMode = initiativeMode ?? 'building';
    }
    const ref = await userRef(userEmail)
      .collection('conversations')
      .add(docPayload);
    return ref.id;
  } catch (err) {
    if (isFirestoreUnavailable(err)) {
      // No Firestore yet — store in-memory so multi-turn works locally
      const id = `local-${randomUUID()}`;
      localStore.set(id, {
        title,
        mode: mode ?? 'builder',
        messages: [],
        initiativeId,
        initiativeMode,
        source,
      });
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
): Promise<{ messageLimitReached: boolean }> {
  // Local IDs: persist in-memory so follow-up turns have history
  if (conversationId.startsWith('local-')) {
    const conv = localStore.get(conversationId);
    if (conv) {
      conv.messages.push(...messages);
      const hit = conv.messages.length > 100;
      if (hit) conv.messages = conv.messages.slice(-100);
      return { messageLimitReached: hit };
    }
    return { messageLimitReached: false };
  }

  try {
    const ref = convRef(userEmail, conversationId);
    const snap = await ref.get();
    const existing: DisplayMessage[] = snap.exists
      ? (snap.data()?.messages as DisplayMessage[]) ?? []
      : [];

    const combined = [...existing, ...messages];
    // Keep at most 100 messages to stay well within the 1MB Firestore doc limit
    const messageLimitReached = combined.length > 100;
    const trimmed = messageLimitReached ? combined.slice(-100) : combined;

    await ref.set(
      {
        messages: trimmed,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    return { messageLimitReached };
  } catch (err) {
    if (isFirestoreUnavailable(err)) return { messageLimitReached: false };
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
    return conv
      ? {
          id: conversationId,
          title: conv.title,
          mode: conv.mode,
          messages: conv.messages,
          initiativeId: conv.initiativeId,
          initiativeMode: conv.initiativeMode,
          source: conv.source,
        }
      : null;
  }

  try {
    const snap = await convRef(userEmail, conversationId).get();
    if (!snap.exists) return null;

    const data = snap.data()!;
    return {
      id: snap.id,
      title: data.title as string,
      departmentId: (data.departmentId as string) ?? undefined,
      mode: (data.mode as AssistantMode) ?? 'builder',
      messages: (data.messages as DisplayMessage[]) ?? [],
      initiativeId: (data.initiativeId as string) ?? undefined,
      initiativeMode: (data.initiativeMode as 'planning' | 'building' | undefined) ?? undefined,
      // Pre-v0.30 docs lack `source`; treat as 'standalone' for safety.
      source: ((data.source as ConversationSource | undefined) ?? 'standalone'),
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
        mode: (data.mode as AssistantMode) ?? 'builder',
        updatedAt,
      };
    });
  } catch (err) {
    if (isFirestoreUnavailable(err)) return [];
    throw err;
  }
}

// ─── Analytics: Write (fire-and-forget) ─────────────────────────────────────

export async function logAnalyticsEvent(event: AnalyticsEvent): Promise<void> {
  try {
    await getDb().collection('analytics_events').add({
      ...event,
      _createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  } catch (err) {
    if (isFirestoreUnavailable(err)) return;
    console.error('Failed to log analytics event:', err);
  }
}

export async function logDeployEvent(event: DeployEvent): Promise<void> {
  try {
    await getDb().collection('analytics_deploys').add({
      ...event,
      _createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  } catch (err) {
    if (isFirestoreUnavailable(err)) return;
    console.error('Failed to log deploy event:', err);
  }
}

export async function logFeedback(entry: FeedbackEntry): Promise<void> {
  try {
    await getDb().collection('analytics_feedback').add({
      ...entry,
      _createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  } catch (err) {
    if (isFirestoreUnavailable(err)) return;
    console.error('Failed to log feedback:', err);
  }
}

// ─── Analytics: Read (for dashboard) ────────────────────────────────────────

function toIso(val: unknown): string {
  if (val instanceof admin.firestore.Timestamp) return val.toDate().toISOString();
  if (typeof val === 'string') return val;
  return new Date().toISOString();
}

export async function getAnalyticsEvents(
  from: Date,
  to: Date,
): Promise<AnalyticsEvent[]> {
  try {
    const snap = await getDb()
      .collection('analytics_events')
      .where('_createdAt', '>=', admin.firestore.Timestamp.fromDate(from))
      .where('_createdAt', '<=', admin.firestore.Timestamp.fromDate(to))
      .orderBy('_createdAt', 'desc')
      .limit(5000)
      .get();

    return snap.docs.map(doc => {
      const d = doc.data();
      return {
        userEmail: d.userEmail ?? '',
        departmentId: d.departmentId ?? '',
        conversationId: d.conversationId ?? '',
        turnNumber: d.turnNumber ?? 0,
        sessionStartedAt: toIso(d.sessionStartedAt),
        latencyMs: d.latencyMs ?? 0,
        toolCallCount: d.toolCallCount ?? 0,
        toolCallNames: d.toolCallNames ?? [],
        skillsLoaded: d.skillsLoaded ?? [],
        specsLoaded: d.specsLoaded ?? [],
        seeded: d.seeded ?? false,
        mode: (d.mode as AssistantMode) ?? 'builder',
        createdAt: toIso(d._createdAt),
      } satisfies AnalyticsEvent;
    });
  } catch (err) {
    if (isFirestoreUnavailable(err)) return [];
    throw err;
  }
}

export async function getDeployEvents(
  from: Date,
  to: Date,
): Promise<DeployEvent[]> {
  try {
    const snap = await getDb()
      .collection('analytics_deploys')
      .where('_createdAt', '>=', admin.firestore.Timestamp.fromDate(from))
      .where('_createdAt', '<=', admin.firestore.Timestamp.fromDate(to))
      .orderBy('_createdAt', 'desc')
      .limit(5000)
      .get();

    return snap.docs.map(doc => {
      const d = doc.data();
      return {
        userEmail: d.userEmail ?? '',
        departmentId: d.departmentId ?? '',
        conversationId: d.conversationId ?? '',
        workflowId: d.workflowId ?? '',
        workflowUrl: d.workflowUrl ?? '',
        workflowName: d.workflowName ?? '',
        nodeCount: d.nodeCount ?? 0,
        nodeTypes: d.nodeTypes ?? [],
        hasSqlQuery: d.hasSqlQuery ?? false,
        complexityScore: d.complexityScore ?? 1,
        estimatedHoursSaved: d.estimatedHoursSaved ?? 0,
        estimatedValueUsd: d.estimatedValueUsd ?? 0,
        createdAt: toIso(d._createdAt),
      } satisfies DeployEvent;
    });
  } catch (err) {
    if (isFirestoreUnavailable(err)) return [];
    throw err;
  }
}

export async function getFeedbackEntries(
  from: Date,
  to: Date,
): Promise<FeedbackEntry[]> {
  try {
    const snap = await getDb()
      .collection('analytics_feedback')
      .where('_createdAt', '>=', admin.firestore.Timestamp.fromDate(from))
      .where('_createdAt', '<=', admin.firestore.Timestamp.fromDate(to))
      .orderBy('_createdAt', 'desc')
      .limit(1000)
      .get();

    return snap.docs.map(doc => {
      const d = doc.data();
      return {
        userEmail: d.userEmail ?? '',
        conversationId: d.conversationId ?? '',
        messageIndex: d.messageIndex ?? 0,
        rating: d.rating ?? 'up',
        comment: d.comment ?? null,
        createdAt: toIso(d._createdAt),
      } satisfies FeedbackEntry;
    });
  } catch (err) {
    if (isFirestoreUnavailable(err)) return [];
    throw err;
  }
}
