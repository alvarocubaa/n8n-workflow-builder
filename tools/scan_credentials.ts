/**
 * scan_credentials.ts
 *
 * Scans all n8n workflows for credential usage and compares against the
 * credential registry in departments.ts. Produces a diff report showing:
 *   - Credentials used in workflows but missing from departments.ts
 *   - Credentials in departments.ts but unused in any workflow
 *   - Department mismatches (credential used by wrong department)
 *
 * Usage:
 *   cd chat-ui && NODE_PATH=./node_modules npx tsx ../tools/scan_credentials.ts
 *   cd chat-ui && NODE_PATH=./node_modules npx tsx ../tools/scan_credentials.ts --department cx
 *   cd chat-ui && NODE_PATH=./node_modules npx tsx ../tools/scan_credentials.ts --update  # writes suggested additions to stdout as TS
 *
 * Prerequisites:
 *   - .env file with N8N_API_URL and N8N_API_KEY
 */

import * as fs from 'fs';
import * as path from 'path';
import { DEPARTMENTS, SHARED_CREDENTIALS, type Credential, type DepartmentConfig } from '../chat-ui/src/lib/departments';

// ─── Load env (no dotenv dependency) ────────────────────────────────────────

const envPath = path.join(path.dirname(__dirname), '.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim();
    if (!process.env[key]) process.env[key] = val;
  }
}

const N8N_API_URL = process.env.N8N_API_URL?.replace(/\/$/, '');
const N8N_API_KEY = process.env.N8N_API_KEY;

if (!N8N_API_URL || !N8N_API_KEY) {
  console.error('Missing N8N_API_URL or N8N_API_KEY in .env');
  process.exit(1);
}

// ─── Types ──────────────────────────────────────────────────────────────────

interface N8nWorkflowNode {
  type: string;
  name: string;
  credentials?: Record<string, { id: string; name: string }>;
}

interface N8nWorkflow {
  id: string;
  name: string;
  nodes: N8nWorkflowNode[];
  sharedWithProjects?: Array<{ id: string; name: string; type: string }>;
}

interface CredentialUsage {
  credId: string;
  credName: string;
  credType: string;
  workflowId: string;
  workflowName: string;
  nodeName: string;
  nodeType: string;
}

// ─── n8n API helpers ────────────────────────────────────────────────────────

async function n8nFetch<T>(endpoint: string): Promise<T> {
  const url = `${N8N_API_URL}/api/v1${endpoint}`;
  const resp = await fetch(url, {
    headers: { 'X-N8N-API-KEY': N8N_API_KEY! },
  });
  if (!resp.ok) {
    throw new Error(`n8n API ${endpoint}: ${resp.status} ${resp.statusText}`);
  }
  return resp.json() as Promise<T>;
}

async function fetchAllWorkflows(): Promise<N8nWorkflow[]> {
  const all: N8nWorkflow[] = [];
  let cursor: string | undefined;
  do {
    const params = cursor ? `?cursor=${cursor}&limit=100` : '?limit=100';
    const resp = await n8nFetch<{ data: N8nWorkflow[]; nextCursor?: string | null }>(
      `/workflows${params}`
    );
    all.push(...resp.data);
    cursor = resp.nextCursor ?? undefined;
  } while (cursor);
  return all;
}

// ─── Build registry from departments.ts ─────────────────────────────────────

function buildRegistryMap(): Map<string, { credential: Credential; department: string }> {
  const map = new Map<string, { credential: Credential; department: string }>();

  for (const cred of SHARED_CREDENTIALS) {
    map.set(cred.id, { credential: cred, department: 'shared' });
  }

  for (const [deptId, dept] of Object.entries(DEPARTMENTS)) {
    for (const cred of dept.credentials) {
      map.set(cred.id, { credential: cred, department: deptId });
    }
  }

  return map;
}

// Map n8n project IDs back to department names
function buildProjectToDeptMap(): Map<string, string> {
  const map = new Map<string, string>();
  for (const [deptId, dept] of Object.entries(DEPARTMENTS)) {
    if (dept.n8nProjectId) {
      map.set(dept.n8nProjectId, deptId);
    }
  }
  return map;
}

// ─── Extract credential usage from workflows ───────────────────────────────

function extractCredentialUsage(workflow: N8nWorkflow): CredentialUsage[] {
  const usages: CredentialUsage[] = [];
  for (const node of workflow.nodes || []) {
    if (!node.credentials) continue;
    for (const [credType, credRef] of Object.entries(node.credentials)) {
      if (credRef?.id) {
        usages.push({
          credId: credRef.id,
          credName: credRef.name || '(unnamed)',
          credType,
          workflowId: workflow.id,
          workflowName: workflow.name,
          nodeName: node.name,
          nodeType: node.type,
        });
      }
    }
  }
  return usages;
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const filterDept = args.includes('--department') ? args[args.indexOf('--department') + 1] : null;
  const showUpdate = args.includes('--update');

  console.log('=== n8n Credential Scanner ===\n');

  // Step 1: Fetch all workflows (list endpoint includes nodes+credentials inline)
  console.log('Fetching workflows from n8n API...');
  const workflowList = await fetchAllWorkflows();
  console.log(`  Found ${workflowList.length} workflows\n`);

  // Extract credentials directly from the list response (no per-workflow API call needed)
  console.log('Extracting credential usage from workflow nodes...');
  const allUsages: CredentialUsage[] = [];
  const projectToDept = buildProjectToDeptMap();
  const workflowDeptMap = new Map<string, string>(); // workflowId -> dept

  let scanned = 0;
  for (const wf of workflowList) {
    const usages = extractCredentialUsage(wf);
    allUsages.push(...usages);

    // Determine workflow department from shared project
    const shared = (wf as unknown as { shared?: Array<{ projectId: string }> }).shared;
    if (shared) {
      for (const entry of shared) {
        const dept = projectToDept.get(entry.projectId);
        if (dept) {
          workflowDeptMap.set(wf.id, dept);
          break;
        }
      }
    }

    scanned++;
  }
  console.log(`  Scanned ${scanned} workflows, found ${allUsages.length} credential usages\n`);

  // Step 3: Build registry and compare
  const registry = buildRegistryMap();
  const registryIds = new Set(registry.keys());

  // Unique credential IDs actually used in workflows
  const usedCredIds = new Map<string, CredentialUsage[]>();
  for (const usage of allUsages) {
    if (!usedCredIds.has(usage.credId)) {
      usedCredIds.set(usage.credId, []);
    }
    usedCredIds.get(usage.credId)!.push(usage);
  }

  // ─── Report: Missing from departments.ts ────────────────────────────────

  console.log('══════════════════════════════════════════════════════════════');
  console.log('  MISSING FROM departments.ts (used in workflows, not registered)');
  console.log('══════════════════════════════════════════════════════════════\n');

  const missing: Array<{ id: string; name: string; type: string; usedIn: string[]; depts: string[] }> = [];

  for (const [credId, usages] of usedCredIds) {
    if (!registryIds.has(credId)) {
      const firstUsage = usages[0];
      const workflowNames = [...new Set(usages.map(u => u.workflowName))].slice(0, 3);
      const depts = [...new Set(usages.map(u => workflowDeptMap.get(u.workflowId)).filter(Boolean))] as string[];

      if (filterDept && depts.length > 0 && !depts.includes(filterDept)) continue;

      missing.push({
        id: credId,
        name: firstUsage.credName,
        type: firstUsage.credType,
        usedIn: workflowNames,
        depts,
      });
    }
  }

  if (missing.length === 0) {
    console.log('  None! All workflow credentials are registered.\n');
  } else {
    console.log(`  Found ${missing.length} unregistered credentials:\n`);
    for (const m of missing.sort((a, b) => a.type.localeCompare(b.type))) {
      const deptLabel = m.depts.length > 0 ? m.depts.join(', ') : '(unknown dept)';
      console.log(`  [${deptLabel}] ${m.type}: "${m.name}" (${m.id})`);
      console.log(`    Used in: ${m.usedIn.join(' | ')}`);
    }
  }

  // ─── Report: Unused in departments.ts ───────────────────────────────────

  console.log('\n══════════════════════════════════════════════════════════════');
  console.log('  UNUSED IN departments.ts (registered but not in any workflow)');
  console.log('══════════════════════════════════════════════════════════════\n');

  const unused: Array<{ credential: Credential; department: string }> = [];

  for (const [credId, entry] of registry) {
    if (!usedCredIds.has(credId)) {
      if (filterDept && entry.department !== filterDept) continue;
      unused.push(entry);
    }
  }

  if (unused.length === 0) {
    console.log('  None! All registered credentials are used.\n');
  } else {
    console.log(`  Found ${unused.length} unused credentials:\n`);
    for (const u of unused.sort((a, b) => a.department.localeCompare(b.department))) {
      console.log(`  [${u.department}] ${u.credential.type}: "${u.credential.name}" (${u.credential.id})`);
    }
  }

  // ─── Report: Summary by department ──────────────────────────────────────

  console.log('\n══════════════════════════════════════════════════════════════');
  console.log('  COVERAGE SUMMARY');
  console.log('══════════════════════════════════════════════════════════════\n');

  for (const [deptId, dept] of Object.entries(DEPARTMENTS)) {
    if (filterDept && deptId !== filterDept) continue;

    const registered = dept.credentials.length;
    const usedInDept = dept.credentials.filter(c => usedCredIds.has(c.id)).length;
    const missingForDept = missing.filter(m => m.depts.includes(deptId)).length;

    const bar = '█'.repeat(Math.round((usedInDept / Math.max(registered, 1)) * 20));
    console.log(`  ${dept.displayName.padEnd(20)} ${usedInDept}/${registered} used ${bar}  +${missingForDept} missing`);
  }

  // ─── Optional: generate TS additions ──────────────────────────────────

  if (showUpdate && missing.length > 0) {
    console.log('\n══════════════════════════════════════════════════════════════');
    console.log('  SUGGESTED departments.ts ADDITIONS');
    console.log('══════════════════════════════════════════════════════════════\n');

    for (const m of missing) {
      const dept = m.depts[0] || 'UNKNOWN';
      console.log(`  // Add to ${dept} credentials:`);
      console.log(`  { service: '${m.name}', name: '${m.name}', type: '${m.type}', id: '${m.id}', env: 'production' },`);
    }
  }

  // ─── Final stats ──────────────────────────────────────────────────────

  console.log(`\n─── Stats ───`);
  console.log(`  Workflows scanned:  ${scanned}`);
  console.log(`  Credential usages:  ${allUsages.length}`);
  console.log(`  Unique creds used:  ${usedCredIds.size}`);
  console.log(`  Registered:         ${registryIds.size}`);
  console.log(`  Missing:            ${missing.length}`);
  console.log(`  Unused:             ${unused.length}`);
}

main().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
