/**
 * seed_analytics.ts
 *
 * One-time script to seed analytics_events from existing Firestore conversations.
 * Run with: npx tsx tools/seed_analytics.ts
 *
 * Prerequisites:
 *   - gcloud auth application-default login (for Firestore access)
 *   - GOOGLE_CLOUD_PROJECT=agentic-workflows-485210 (or set in env)
 */

import admin from 'firebase-admin';

// Initialize Firebase
if (!admin.apps.length) {
  admin.initializeApp({
    projectId: process.env.GOOGLE_CLOUD_PROJECT || 'agentic-workflows-485210',
  });
}
const db = admin.firestore();

interface ConversationDoc {
  title?: string;
  departmentId?: string;
  createdAt?: admin.firestore.Timestamp;
  updatedAt?: admin.firestore.Timestamp;
  messages?: Array<{
    role: string;
    content: string;
    timestamp?: string;
  }>;
}

function extractWorkflowFromMessages(messages: ConversationDoc['messages']): {
  found: boolean;
  nodeCount: number;
  nodeTypes: string[];
  hasSqlQuery: boolean;
} {
  if (!messages) return { found: false, nodeCount: 0, nodeTypes: [], hasSqlQuery: false };

  for (const msg of messages) {
    if (msg.role !== 'model') continue;
    // Look for JSON code blocks with workflow markers
    const jsonMatch = msg.content.match(/```json\s*([\s\S]*?)```/);
    if (!jsonMatch) continue;

    try {
      const parsed = JSON.parse(jsonMatch[1]);
      if (Array.isArray(parsed.nodes) && parsed.connections !== undefined) {
        const nodes = parsed.nodes;
        const nodeTypes = [...new Set(nodes.map((n: { type?: string }) => n.type ?? ''))];
        const hasSqlQuery = nodeTypes.some((t: string) =>
          t.includes('BigQuery') || t.includes('bigQuery')
        );
        return {
          found: true,
          nodeCount: nodes.length,
          nodeTypes,
          hasSqlQuery,
        };
      }
    } catch {
      // Not valid JSON, skip
    }
  }

  return { found: false, nodeCount: 0, nodeTypes: [], hasSqlQuery: false };
}

async function main() {
  // Use collectionGroup to find ALL conversations — parent user docs may not exist
  // (Firestore allows subcollections under phantom parents)
  console.log('Fetching all conversations via collectionGroup...');
  const allConvs = await db.collectionGroup('conversations').get();
  console.log(`Found ${allConvs.size} conversations`);

  let totalSeeded = 0;

  for (const convDoc of allConvs.docs) {
    const data = convDoc.data() as ConversationDoc;
    const userEmail = convDoc.ref.parent.parent?.id ?? 'unknown';
    const messages = data.messages ?? [];
    const turnCount = Math.floor(messages.filter(m => m.role === 'user').length);

    const workflow = extractWorkflowFromMessages(data.messages);

    const createdAt = data.createdAt instanceof admin.firestore.Timestamp
      ? data.createdAt.toDate()
      : new Date();

    // Extract tool call names from model messages (approximate)
    const toolCallNames: string[] = [];
    for (const msg of messages) {
      if (msg.role !== 'model') continue;
      if (msg.content.includes('get_company_spec')) toolCallNames.push('get_company_spec');
      if (msg.content.includes('get_n8n_skill')) toolCallNames.push('get_n8n_skill');
      if (msg.content.includes('search_nodes')) toolCallNames.push('search_nodes');
      if (msg.content.includes('validate_node')) toolCallNames.push('validate_node');
    }

    const event = {
      userEmail,
      departmentId: data.departmentId ?? 'cx',
      conversationId: convDoc.id,
      turnNumber: turnCount,
      sessionStartedAt: createdAt.toISOString(),
      latencyMs: 0, // unknown for historical data
      toolCallCount: toolCallNames.length,
      toolCallNames,
      skillsLoaded: toolCallNames.filter(n => n === 'get_n8n_skill'),
      specsLoaded: toolCallNames.filter(n => n === 'get_company_spec'),
      seeded: true,
      createdAt: createdAt.toISOString(),
      _createdAt: admin.firestore.Timestamp.fromDate(createdAt),
    };

    await db.collection('analytics_events').add(event);
    totalSeeded++;

    const label = workflow.found ? `workflow (${workflow.nodeCount} nodes)` : `${turnCount} turns`;
    console.log(`  ${userEmail} | ${convDoc.id} | ${label}`);
  }

  console.log(`\nDone! Seeded ${totalSeeded} analytics events from ${allConvs.size} conversations.`);
  process.exit(0);
}

main().catch(err => {
  console.error('Seeding failed:', err);
  process.exit(1);
});
