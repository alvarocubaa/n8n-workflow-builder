/**
 * harvest_test_cases.ts
 *
 * Scans Firestore conversations for workflow JSONs and extracts candidate test
 * cases grouped by department. Each candidate captures the user's first prompt
 * and the last workflow JSON the AI produced.
 *
 * Two source modes:
 *   --source conversations  (default) Scan ALL conversations for workflow JSONs
 *   --source deploys        Only scan conversations with analytics_deploys events
 *
 * Usage:
 *   npx tsx tools/harvest_test_cases.ts                              # all conversations
 *   npx tsx tools/harvest_test_cases.ts --source deploys             # deployed only
 *   npx tsx tools/harvest_test_cases.ts --from 2026-03-01            # since date
 *   npx tsx tools/harvest_test_cases.ts --department ob              # filter dept
 *   npx tsx tools/harvest_test_cases.ts --min-confidence medium      # skip low
 *   npx tsx tools/harvest_test_cases.ts --include-tests              # include short/test convos
 *   npx tsx tools/harvest_test_cases.ts --output output/harvested    # custom dir
 *   npx tsx tools/harvest_test_cases.ts --dry-run                    # no file writes
 *
 * Prerequisites:
 *   - gcloud auth application-default login
 *   - GOOGLE_CLOUD_PROJECT=agentic-workflows-485210 (or set in env)
 */

import admin from 'firebase-admin';
import * as fs from 'fs';
import * as path from 'path';
import { DEPARTMENTS, SHARED_CREDENTIALS, type Credential } from '../chat-ui/src/lib/departments';

// ─── Firebase init ───────────────────────────────────────────────────────────

if (!admin.apps.length) {
  admin.initializeApp({
    projectId: process.env.GOOGLE_CLOUD_PROJECT || 'agentic-workflows-485210',
  });
}
const db = admin.firestore();

// ─── Types ───────────────────────────────────────────────────────────────────

interface DeployDoc {
  userEmail: string;
  departmentId: string;
  conversationId: string;
  workflowId: string;
  workflowName: string;
  nodeTypes: string[];
  nodeCount: number;
  complexityScore: number;
  hasSqlQuery: boolean;
  _createdAt?: admin.firestore.Timestamp;
}

interface ConversationDoc {
  title?: string;
  departmentId?: string;
  createdAt?: admin.firestore.Timestamp;
  messages?: Array<{
    role: string;
    content: string;
    timestamp?: string;
  }>;
}

type SourceMode = 'conversations' | 'deploys';

interface ExtractedWorkflow {
  found: boolean;
  json: Record<string, unknown> | null;
  nodeCount: number;
  nodeTypes: string[];
  credentials: Record<string, string>; // type -> id
  hasSqlQuery: boolean;
}

type Confidence = 'high' | 'medium' | 'low';

interface Candidate {
  name: string;
  description: string;
  department: string;
  prompt: string;
  confirm_message: string;
  expected_nodes: string[];
  expected_creds: Record<string, string>;
  checks: string[];
  _metadata: {
    source_conversation: string;
    source_user: string;
    deployed: boolean;
    deployed_workflow_id: string;
    workflow_name: string;
    node_count: number;
    complexity_score: number;
    harvested_at: string;
    confidence: Confidence;
    workflow_json_file: string;
  };
}

// ─── CLI args ────────────────────────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {
    source: 'conversations' as SourceMode,
    from: null as string | null,
    to: null as string | null,
    department: null as string | null,
    minConfidence: 'low' as Confidence,
    output: path.join(path.dirname(__dirname), 'feedback-loop', 'candidates'),
    includeTests: false,
    dryRun: false,
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--source': opts.source = args[++i] as SourceMode; break;
      case '--from': opts.from = args[++i]; break;
      case '--to': opts.to = args[++i]; break;
      case '--department': opts.department = args[++i]; break;
      case '--min-confidence': opts.minConfidence = args[++i] as Confidence; break;
      case '--output': opts.output = args[++i]; break;
      case '--include-tests': opts.includeTests = true; break;
      case '--dry-run': opts.dryRun = true; break;
    }
  }
  return opts;
}

// ─── Workflow extraction ─────────────────────────────────────────────────────

/**
 * Extract the LAST workflow JSON from assistant messages.
 * Iterates in reverse to find the final version the user approved.
 */
function extractLastWorkflow(messages: ConversationDoc['messages']): ExtractedWorkflow {
  const empty: ExtractedWorkflow = { found: false, json: null, nodeCount: 0, nodeTypes: [], credentials: {}, hasSqlQuery: false };
  if (!messages) return empty;

  // Iterate in reverse to find the LAST workflow JSON
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.role !== 'model') continue;

    // Find all ```json blocks and check each
    const jsonBlocks = msg.content.matchAll(/```json\s*([\s\S]*?)```/g);
    for (const match of jsonBlocks) {
      try {
        const parsed = JSON.parse(match[1]);
        if (Array.isArray(parsed.nodes) && parsed.connections !== undefined) {
          const nodes = parsed.nodes as Array<{
            type?: string;
            credentials?: Record<string, { id?: string; name?: string }>;
            parameters?: Record<string, unknown>;
          }>;

          // Extract node types (short names)
          const nodeTypes = [...new Set(
            nodes
              .map(n => (n.type ?? '').replace('n8n-nodes-base.', ''))
              .filter(Boolean)
          )];

          // Extract credentials
          const credentials: Record<string, string> = {};
          for (const node of nodes) {
            if (!node.credentials) continue;
            for (const [credType, credVal] of Object.entries(node.credentials)) {
              if (credVal.id) {
                credentials[credType] = credVal.id;
              }
            }
          }

          // Detect SQL queries
          const hasSqlQuery = nodeTypes.some(t =>
            t.toLowerCase().includes('bigquery') || t.toLowerCase().includes('googleBigQuery'.toLowerCase())
          );

          return {
            found: true,
            json: parsed,
            nodeCount: nodes.length,
            nodeTypes,
            credentials,
            hasSqlQuery,
          };
        }
      } catch {
        // Not valid JSON, continue
      }
    }
  }

  return empty;
}

// ─── Credential validation ───────────────────────────────────────────────────

/**
 * Validate extracted credentials against department config.
 * Returns the count of credentials that match the department's known credentials.
 */
function validateCredentials(
  extractedCreds: Record<string, string>,
  departmentId: string,
): { validCount: number; totalCount: number; invalidCreds: string[] } {
  const dept = DEPARTMENTS[departmentId];
  if (!dept) return { validCount: 0, totalCount: Object.keys(extractedCreds).length, invalidCreds: Object.keys(extractedCreds) };

  const allDeptCreds: Credential[] = [...dept.credentials, ...SHARED_CREDENTIALS];
  const knownIds = new Set(allDeptCreds.map(c => c.id));

  const invalidCreds: string[] = [];
  let validCount = 0;

  for (const [credType, credId] of Object.entries(extractedCreds)) {
    if (knownIds.has(credId)) {
      validCount++;
    } else {
      invalidCreds.push(`${credType}:${credId}`);
    }
  }

  return { validCount, totalCount: Object.keys(extractedCreds).length, invalidCreds };
}

// ─── Confidence scoring ──────────────────────────────────────────────────────

function scoreConfidence(
  workflow: ExtractedWorkflow,
  credValidation: { validCount: number; totalCount: number },
): Confidence {
  if (!workflow.found) return 'low';
  if (credValidation.totalCount > 0 && credValidation.validCount === credValidation.totalCount && workflow.nodeCount >= 3) {
    return 'high';
  }
  if (workflow.found && (credValidation.validCount < credValidation.totalCount || workflow.nodeCount < 3)) {
    return 'medium';
  }
  return 'medium';
}

// ─── Determine audit checks ─────────────────────────────────────────────────

function determineChecks(nodeTypes: string[]): string[] {
  const checks = ['encoding', 'uuids', 'credentials'];
  const lower = nodeTypes.map(t => t.toLowerCase());

  if (lower.some(t => t.includes('bigquery') || t === 'googlebigquery')) {
    checks.push('bq_projectId');
  }
  if (lower.some(t => t.includes('salesforce') && !t.includes('trigger'))) {
    checks.push('sf_config');
  }
  if (lower.some(t => t === 'slack')) {
    checks.push('slack_config');
  }

  return checks;
}

// ─── Prompt cleaning ─────────────────────────────────────────────────────────

function cleanPrompt(raw: string): string {
  // Trim whitespace, normalize line breaks, cap at 500 chars
  let cleaned = raw.trim().replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n');
  if (cleaned.length > 500) {
    cleaned = cleaned.substring(0, 497) + '...';
  }
  return cleaned;
}

// ─── Load existing test case conversation IDs for deduplication ──────────────

function loadExistingConversationIds(yamlPath: string, candidatesDir: string): Set<string> {
  const ids = new Set<string>();

  // 1. Scan test_cases.yaml
  try {
    const content = fs.readFileSync(yamlPath, 'utf-8');
    const matches = content.matchAll(/source_conversation:\s*(\S+)/g);
    for (const m of matches) {
      ids.add(m[1]);
    }
  } catch {
    // File not found, no existing cases
  }

  // 2. Scan existing candidate YAML files in output directory
  try {
    const depts = fs.readdirSync(candidatesDir, { withFileTypes: true });
    for (const dept of depts) {
      if (!dept.isDirectory()) continue;
      const deptPath = path.join(candidatesDir, dept.name);
      const files = fs.readdirSync(deptPath).filter(f => f.endsWith('.yaml'));
      for (const file of files) {
        try {
          const content = fs.readFileSync(path.join(deptPath, file), 'utf-8');
          const matches = content.matchAll(/source_conversation:\s*(\S+)/g);
          for (const m of matches) {
            ids.add(m[1]);
          }
        } catch { /* skip unreadable files */ }
      }
    }
  } catch {
    // Directory doesn't exist yet
  }

  return ids;
}

// ─── YAML serialization (simple, no dependency) ──────────────────────────────

function candidateToYaml(c: Candidate): string {
  const lines: string[] = [];
  lines.push(`- name: ${c.name}`);
  lines.push(`  description: "${c.description.replace(/"/g, '\\"')}"`);
  lines.push(`  department: ${c.department}`);
  lines.push(`  prompt: >`);
  // Indent prompt lines
  for (const line of c.prompt.split('\n')) {
    lines.push(`    ${line}`);
  }
  lines.push(`  confirm_message: "${c.confirm_message}"`);
  lines.push(`  expected_nodes:`);
  for (const n of c.expected_nodes) {
    lines.push(`    - ${n}`);
  }
  lines.push(`  expected_creds:`);
  for (const [k, v] of Object.entries(c.expected_creds)) {
    lines.push(`    ${k}: ${v}`);
  }
  lines.push(`  checks:`);
  for (const ch of c.checks) {
    lines.push(`    - ${ch}`);
  }
  lines.push(`  _metadata:`);
  lines.push(`    source_conversation: ${c._metadata.source_conversation}`);
  lines.push(`    source_user: ${c._metadata.source_user}`);
  lines.push(`    deployed: ${c._metadata.deployed}`);
  lines.push(`    deployed_workflow_id: ${c._metadata.deployed_workflow_id}`);
  lines.push(`    workflow_name: "${c._metadata.workflow_name.replace(/"/g, '\\"')}"`);
  lines.push(`    node_count: ${c._metadata.node_count}`);
  lines.push(`    complexity_score: ${c._metadata.complexity_score}`);
  lines.push(`    harvested_at: ${c._metadata.harvested_at}`);
  lines.push(`    confidence: ${c._metadata.confidence}`);
  lines.push(`    workflow_json_file: ${c._metadata.workflow_json_file}`);
  return lines.join('\n');
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const opts = parseArgs();
  const confidenceOrder: Confidence[] = ['low', 'medium', 'high'];
  const minIdx = confidenceOrder.indexOf(opts.minConfidence);

  console.log('=== Firestore Use Case Harvester ===');
  console.log(`Source:         ${opts.source}`);
  console.log(`Output:         ${opts.dryRun ? '(dry run)' : opts.output}`);
  console.log(`From:           ${opts.from ?? 'all time'}`);
  console.log(`To:             ${opts.to ?? 'now'}`);
  console.log(`Department:     ${opts.department ?? 'all'}`);
  console.log(`Min confidence: ${opts.minConfidence}`);
  console.log(`Include tests:  ${opts.includeTests}`);
  console.log('');

  // 1. Load deploy events (used for deployed flag in both modes)
  const deploysSnap = await db.collection('analytics_deploys').get();
  const deploysByConvId = new Map<string, DeployDoc>();
  for (const doc of deploysSnap.docs) {
    const data = doc.data() as DeployDoc;
    deploysByConvId.set(data.conversationId, data);
  }
  console.log(`Loaded ${deploysByConvId.size} deploy events`);

  // 2. Load existing conversation IDs for dedup
  const testCasesPath = path.join(__dirname, 'test_cases.yaml');
  const resolvedOutput = path.resolve(opts.output);
  const existingIds = loadExistingConversationIds(testCasesPath, resolvedOutput);
  console.log(`Loaded ${existingIds.size} existing conversation IDs for deduplication`);

  // 3. Fetch conversations based on source mode
  interface ConversationEntry {
    conversationId: string;
    userEmail: string;
    departmentId: string;
    convData: ConversationDoc;
    deploy: DeployDoc | null;
  }

  const entries: ConversationEntry[] = [];
  const stats = { total: 0, skipped_dedup: 0, skipped_no_messages: 0, skipped_no_workflow: 0, skipped_confidence: 0, skipped_test: 0 };

  if (opts.source === 'deploys') {
    // Original mode: only deployed conversations
    console.log('Fetching deployed conversations...');
    let deploys = [...deploysByConvId.values()];

    if (opts.from) {
      const fromTs = admin.firestore.Timestamp.fromDate(new Date(opts.from));
      deploys = deploys.filter(d => d._createdAt && d._createdAt.toMillis() >= fromTs.toMillis());
    }
    if (opts.to) {
      const toTs = admin.firestore.Timestamp.fromDate(new Date(opts.to));
      deploys = deploys.filter(d => d._createdAt && d._createdAt.toMillis() <= toTs.toMillis());
    }
    if (opts.department) {
      deploys = deploys.filter(d => d.departmentId === opts.department);
    }

    console.log(`Found ${deploys.length} deploy events`);

    for (const deploy of deploys) {
      let convData: ConversationDoc | null = null;
      try {
        const convDoc = await db
          .collection('users').doc(deploy.userEmail)
          .collection('conversations').doc(deploy.conversationId)
          .get();
        if (convDoc.exists) {
          convData = convDoc.data() as ConversationDoc;
        }
      } catch {
        // Phantom parent fallback handled below
      }

      if (!convData) {
        try {
          const snap = await db.collectionGroup('conversations')
            .where(admin.firestore.FieldPath.documentId(), '==', deploy.conversationId)
            .limit(1).get();
          if (!snap.empty) convData = snap.docs[0].data() as ConversationDoc;
        } catch { /* skip */ }
      }

      if (convData) {
        entries.push({
          conversationId: deploy.conversationId,
          userEmail: deploy.userEmail,
          departmentId: deploy.departmentId,
          convData,
          deploy,
        });
      }
    }
  } else {
    // New default: scan ALL conversations
    console.log('Scanning all conversations...');
    const allConvs = await db.collectionGroup('conversations').get();
    console.log(`Found ${allConvs.size} conversations`);

    for (const doc of allConvs.docs) {
      const convData = doc.data() as ConversationDoc;
      const userEmail = doc.ref.parent.parent?.id ?? 'unknown';
      const departmentId = convData.departmentId ?? 'cx';
      const conversationId = doc.id;

      // Apply date filters on conversation createdAt
      if (opts.from && convData.createdAt) {
        const fromTs = admin.firestore.Timestamp.fromDate(new Date(opts.from));
        if (convData.createdAt.toMillis() < fromTs.toMillis()) continue;
      }
      if (opts.to && convData.createdAt) {
        const toTs = admin.firestore.Timestamp.fromDate(new Date(opts.to));
        if (convData.createdAt.toMillis() > toTs.toMillis()) continue;
      }

      // Apply department filter
      if (opts.department && departmentId !== opts.department) continue;

      entries.push({
        conversationId,
        userEmail,
        departmentId,
        convData,
        deploy: deploysByConvId.get(conversationId) ?? null,
      });
    }
  }

  console.log(`Processing ${entries.length} conversations...\n`);

  // 4. Process each conversation: extract prompt + workflow
  const candidates: Candidate[] = [];
  const workflowJsonMap = new Map<string, Record<string, unknown>>();
  const deptCounters: Record<string, number> = {};

  for (const entry of entries) {
    stats.total++;
    const { conversationId, userEmail, departmentId, convData, deploy } = entry;

    // Dedup check
    if (existingIds.has(conversationId)) {
      stats.skipped_dedup++;
      continue;
    }

    if (!convData.messages || convData.messages.length === 0) {
      stats.skipped_no_messages++;
      continue;
    }

    // Extract first user message
    const firstUserMsg = convData.messages.find(m => m.role === 'user');
    if (!firstUserMsg) {
      stats.skipped_no_messages++;
      continue;
    }

    // Filter test/dummy conversations (unless --include-tests)
    if (!opts.includeTests) {
      const userMsgCount = convData.messages.filter(m => m.role === 'user').length;
      if (userMsgCount < 2) {
        stats.skipped_test++;
        continue;
      }
      if (firstUserMsg.content.trim().length < 15) {
        stats.skipped_test++;
        continue;
      }
    }

    // Extract last workflow JSON
    const workflow = extractLastWorkflow(convData.messages);
    if (!workflow.found) {
      stats.skipped_no_workflow++;
      continue;
    }
    if (workflow.json) {
      workflowJsonMap.set(conversationId, workflow.json);
    }

    // Validate credentials
    const credValidation = validateCredentials(workflow.credentials, departmentId);
    const confidence = scoreConfidence(workflow, credValidation);

    // Filter by confidence
    if (confidenceOrder.indexOf(confidence) < minIdx) {
      stats.skipped_confidence++;
      continue;
    }

    // Build candidate
    const deptIdx = (deptCounters[departmentId] ?? 0) + 1;
    deptCounters[departmentId] = deptIdx;
    const paddedIdx = String(deptIdx).padStart(3, '0');
    const candidateName = `harvested_${departmentId}_${paddedIdx}`;
    const isDeployed = deploy !== null;

    // Short description from deploy name, conversation title, or prompt start
    const descSnippet = deploy?.workflowName
      || convData.title
      || firstUserMsg.content.substring(0, 60).replace(/\n/g, ' ');

    const candidate: Candidate = {
      name: candidateName,
      description: `Harvested from ${userEmail} - ${descSnippet}`,
      department: departmentId,
      prompt: cleanPrompt(firstUserMsg.content),
      confirm_message: 'Looks good, build it',
      expected_nodes: workflow.nodeTypes.filter(t => !t.includes('noOp') && !t.includes('stickyNote')),
      expected_creds: workflow.credentials,
      checks: determineChecks(workflow.nodeTypes),
      _metadata: {
        source_conversation: conversationId,
        source_user: userEmail,
        deployed: isDeployed,
        deployed_workflow_id: deploy?.workflowId ?? '',
        workflow_name: deploy?.workflowName ?? convData.title ?? '',
        node_count: workflow.nodeCount,
        complexity_score: deploy?.complexityScore ?? 1,
        harvested_at: new Date().toISOString(),
        confidence,
        workflow_json_file: `${candidateName}_workflow.json`,
      },
    };

    candidates.push(candidate);

    // Log progress
    const credStatus = credValidation.invalidCreds.length > 0
      ? ` (${credValidation.invalidCreds.length} unknown creds)`
      : '';
    const deployTag = isDeployed ? ' [deployed]' : '';
    console.log(`  [${confidence}] ${departmentId} | ${userEmail} | ${candidateName}${credStatus}${deployTag}`);
  }

  console.log('');
  console.log(`=== Harvesting complete ===`);
  console.log(`Total processed:   ${stats.total}`);
  console.log(`Skipped (dedup):   ${stats.skipped_dedup}`);
  console.log(`Skipped (no msgs): ${stats.skipped_no_messages}`);
  console.log(`Skipped (no wf):   ${stats.skipped_no_workflow}`);
  console.log(`Skipped (test):    ${stats.skipped_test}`);
  console.log(`Skipped (conf):    ${stats.skipped_confidence}`);
  console.log(`Candidates:        ${candidates.length}`);

  // Department breakdown
  console.log('\nBy department:');
  const allDepts = ['marketing', 'cs', 'cx', 'ob', 'payments', 'finance'];
  for (const dept of allDepts) {
    const count = candidates.filter(c => c.department === dept).length;
    const bar = '#'.repeat(count);
    console.log(`  ${dept.padEnd(12)} ${String(count).padStart(3)} ${bar}`);
  }

  // Confidence breakdown
  console.log('\nBy confidence:');
  for (const level of ['high', 'medium', 'low'] as Confidence[]) {
    const count = candidates.filter(c => c._metadata.confidence === level).length;
    console.log(`  ${level.padEnd(8)} ${count}`);
  }

  if (opts.dryRun) {
    console.log('\n(Dry run — no files written)');
    process.exit(0);
  }

  if (candidates.length === 0) {
    console.log('\nNo candidates to write.');
    process.exit(0);
  }

  // 4. Write output files grouped by department
  let jsonCount = 0;

  for (const dept of allDepts) {
    const deptCandidates = candidates.filter(c => c.department === dept);
    if (deptCandidates.length === 0) continue;

    const deptDir = path.join(opts.output, dept);
    fs.mkdirSync(deptDir, { recursive: true });

    for (const candidate of deptCandidates) {
      // Write candidate YAML
      const yamlPath = path.join(deptDir, `${candidate.name}.yaml`);
      fs.writeFileSync(yamlPath, candidateToYaml(candidate), 'utf-8');

      // Write workflow JSON from map (stored during extraction)
      const wfJson = workflowJsonMap.get(candidate._metadata.source_conversation);
      if (wfJson) {
        const jsonPath = path.join(deptDir, candidate._metadata.workflow_json_file);
        fs.writeFileSync(jsonPath, JSON.stringify(wfJson, null, 2), 'utf-8');
        jsonCount++;
      }
    }
  }

  // Write summary
  const summary = {
    harvested_at: new Date().toISOString(),
    total_candidates: candidates.length,
    workflow_jsons_written: jsonCount,
    by_department: Object.fromEntries(
      allDepts.map(d => [d, candidates.filter(c => c.department === d).length])
    ),
    by_confidence: Object.fromEntries(
      (['high', 'medium', 'low'] as Confidence[]).map(l => [l, candidates.filter(c => c._metadata.confidence === l).length])
    ),
  };
  const summaryPath = path.join(opts.output, 'summary.json');
  fs.mkdirSync(opts.output, { recursive: true });
  fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2), 'utf-8');

  console.log(`Workflow JSONs:    ${jsonCount}`);
  console.log(`Summary:           ${summaryPath}`);
  console.log(`\nOutput directory:   ${opts.output}`);
  console.log('\nNext steps:');
  console.log('  1. Review candidates in each department folder');
  console.log('  2. Run audit_workflow.py on workflow JSONs to check quality');
  console.log('  3. Cherry-pick high-confidence candidates into test_cases.yaml');
}

main().catch(err => {
  console.error('Harvesting failed:', err);
  process.exit(1);
});
