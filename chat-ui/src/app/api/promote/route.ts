import { getUserFromRequest } from '@/lib/auth';
import {
  updateWorkflow,
  activateWorkflow,
  hasWebhookTrigger,
} from '@/lib/n8n-deploy';
import { getDepartment, SHARED_CREDENTIALS, type DepartmentConfig, type Credential } from '@/lib/departments';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/promote
 *
 * Take a workflow to production. Called by the chat-ui "Apply Promotion" button after the
 * <promote_to_production> checklist has run and the user has confirmed "yes promote".
 *
 * Trust model: this endpoint requires an authenticated chat-ui user. The actual authority
 * gate (PROJ owner / dept admin / AI Team) is enforced by the Hub button visibility — the
 * user reaches this endpoint only by navigating from a Hub PROJ modal where they were
 * already authorized. v2 may add a server-side Hub permission round-trip here.
 *
 * Body:
 *   workflowId: string         — sandbox workflow id (from initiative_workflow_links)
 *   workflowJson: string       — post-checklist JSON with prod creds already swapped by the AI
 *   departmentId: string
 *   innovationItemId: string   — PROJ uuid (so the Hub callback knows which row to update)
 *   initiativeId: string       — INIT uuid (parent of PROJ; used for INIT status sync)
 *   conversationId: string     — for Hub idempotency
 *   activate?: 'yes' | 'no' | 'auto'  — default 'auto' = inactive when webhook trigger present, active otherwise
 *
 * Returns 200 (full success), 207 (partial: transferred but activate failed), 400 (bad input),
 * 401 (no user), 422 (audit failed — n8n unchanged), 502 (transfer failed — n8n unchanged).
 */
export async function POST(req: Request): Promise<Response> {
  const user = await getUserFromRequest(req);
  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: {
    workflowId?: string;
    workflowJson?: string;
    departmentId?: string;
    innovationItemId?: string;
    initiativeId?: string;
    conversationId?: string;
    activate?: 'yes' | 'no' | 'auto';
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const {
    workflowId,
    workflowJson,
    departmentId,
    innovationItemId,
    initiativeId,
    conversationId,
    activate = 'auto',
  } = body;

  // ─── Input validation ─────────────────────────────────────────────────────
  if (!workflowId?.trim()) return Response.json({ error: 'workflowId is required' }, { status: 400 });
  if (!workflowJson?.trim()) return Response.json({ error: 'workflowJson is required' }, { status: 400 });
  if (!departmentId?.trim()) return Response.json({ error: 'departmentId is required' }, { status: 400 });
  if (!innovationItemId?.trim()) return Response.json({ error: 'innovationItemId is required' }, { status: 400 });
  if (!initiativeId?.trim()) return Response.json({ error: 'initiativeId is required' }, { status: 400 });
  if (!conversationId?.trim()) return Response.json({ error: 'conversationId is required' }, { status: 400 });
  if (!['yes', 'no', 'auto'].includes(activate)) {
    return Response.json({ error: `Invalid activate value "${activate}". Must be yes|no|auto.` }, { status: 400 });
  }

  // ─── Department + production project lookup ───────────────────────────────
  const dept = getDepartment(departmentId);
  if (!dept) {
    return Response.json({ error: `Unknown department "${departmentId}"` }, { status: 400 });
  }
  if (!dept.n8nProductionProjectId) {
    return Response.json(
      {
        error: `Department "${dept.displayName}" has no production n8n project configured. Cannot promote. Ask an admin to add n8nProductionProjectId to departments.ts.`,
      },
      { status: 400 },
    );
  }

  // ─── Hard gate: production credential audit ───────────────────────────────
  // Every credential referenced in the workflow JSON must resolve to a production-tagged
  // credential in dept.credentials or SHARED_CREDENTIALS. Any sandbox cred = fail-closed.
  const auditFailures = auditProductionCredentials(workflowJson, dept);
  if (auditFailures.length > 0) {
    return Response.json(
      {
        error: 'Audit failed: workflow still references sandbox credentials',
        stage: 'audit',
        failures: auditFailures,
        hint: 'Re-run the promote checklist in chat — the cred swap on "yes promote" missed at least one node.',
      },
      { status: 422 },
    );
  }

  // ─── Webhook detection → effective activation ─────────────────────────────
  const webhookPresent = hasWebhookTrigger(workflowJson);
  const effectiveActivate =
    activate === 'yes' ? true :
    activate === 'no' ? false :
    /* auto */ !webhookPresent;

  // ─── n8n step 1: update + transfer to prod project ────────────────────────
  // updateWorkflow does PUT JSON + tag "AI Generated" + transfer to the target project, in
  // that order. If the underlying calls fail, we get { error, detail } back.
  const updateResult = await updateWorkflow(
    workflowId,
    workflowJson,
    user.email,
    dept.n8nProductionProjectId,
  );
  if ('error' in updateResult) {
    return Response.json(
      {
        error: 'n8n transfer/update failed — workflow remains in sandbox project',
        stage: 'transfer',
        detail: updateResult.detail ?? updateResult.error,
      },
      { status: 502 },
    );
  }

  // ─── n8n step 2: activate (conditional) ───────────────────────────────────
  let activateStatus: 'ok' | 'skipped' | 'failed' = 'skipped';
  let activateError: string | undefined;
  if (effectiveActivate) {
    const r = await activateWorkflow(workflowId);
    activateStatus = r.status;
    activateError = r.error;
  }

  const activatePartialFailure = effectiveActivate && activateStatus === 'failed';

  // ─── Hub callback (fire-and-forget with retry) ────────────────────────────
  // Hub state must reflect n8n state. If the callback fails, n8n is still the truth.
  fireHubPromoteCallback({
    type: 'workflow_promoted',
    innovation_item_id: innovationItemId,
    initiative_id: initiativeId,
    conversation_id: conversationId,
    n8n_workflow_id: workflowId,
    production_workflow_url: updateResult.workflowUrl,
    n8n_workflow_name: updateResult.workflowName,
    promoted_by: user.email,
    promoted_at: new Date().toISOString(),
    activated: effectiveActivate && activateStatus === 'ok',
    activate_failed: activatePartialFailure,
    webhook_present: webhookPresent,
  });

  // ─── Response ─────────────────────────────────────────────────────────────
  const responseBody = {
    workflowId,
    workflowName: updateResult.workflowName,
    productionWorkflowUrl: updateResult.workflowUrl,
    transferStatus: updateResult.transferStatus ?? 'ok',
    transferError: updateResult.transferError,
    activateStatus,
    activateError,
    webhookPresent,
    effectiveActivate,
    message: activatePartialFailure
      ? 'Workflow is in production project but activation failed. Toggle the workflow active in n8n when the consumer is ready.'
      : effectiveActivate
        ? 'Workflow is live in production.'
        : webhookPresent
          ? 'Workflow is in production project, inactive. Webhook URL not yet exposed — toggle active in n8n when downstream consumer is wired up.'
          : 'Workflow is in production project, inactive (per request).',
  };

  return Response.json(responseBody, { status: activatePartialFailure ? 207 : 200 });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

interface AuditFailure {
  nodeName: string;
  nodeType: string;
  credentialType: string;
  credentialId: string;
  reason: string;
}

/**
 * Walk the workflow's nodes and verify every credential reference resolves to a
 * production-tagged credential in dept.credentials ∪ SHARED_CREDENTIALS. Returns an empty
 * array on full pass, or a list of failed references otherwise.
 *
 * Production rules:
 *   - Every (credentialType, credentialId) pair on every node's `credentials` block must
 *     match a Credential entry with env='production'.
 *   - Sandbox creds → fail. Unknown IDs → fail.
 *   - Nodes without credentials → ignored (not all nodes need creds).
 */
function auditProductionCredentials(workflowJson: string, dept: DepartmentConfig): AuditFailure[] {
  let parsed: { nodes?: Array<{ name?: string; type?: string; credentials?: Record<string, { id?: string; name?: string }> }> };
  try {
    parsed = JSON.parse(workflowJson);
  } catch {
    return [{
      nodeName: '(root)',
      nodeType: '(root)',
      credentialType: '',
      credentialId: '',
      reason: 'Workflow JSON is not parseable',
    }];
  }
  if (!parsed.nodes || !Array.isArray(parsed.nodes)) return [];

  const allCreds: Credential[] = [...dept.credentials, ...SHARED_CREDENTIALS];
  // Index by (type, id) → Credential
  const credIndex = new Map<string, Credential>();
  for (const c of allCreds) {
    credIndex.set(`${c.type}::${c.id}`, c);
  }

  const failures: AuditFailure[] = [];
  for (const node of parsed.nodes) {
    if (!node.credentials || typeof node.credentials !== 'object') continue;
    for (const [credType, credRef] of Object.entries(node.credentials)) {
      if (!credRef || typeof credRef !== 'object') continue;
      const credId = credRef.id;
      if (!credId) {
        failures.push({
          nodeName: node.name ?? '(unknown)',
          nodeType: node.type ?? '(unknown)',
          credentialType: credType,
          credentialId: '',
          reason: 'Credential reference has no id',
        });
        continue;
      }
      const found = credIndex.get(`${credType}::${credId}`);
      if (!found) {
        failures.push({
          nodeName: node.name ?? '(unknown)',
          nodeType: node.type ?? '(unknown)',
          credentialType: credType,
          credentialId: credId,
          reason: `Credential id ${credId} (${credType}) is not registered for department ${dept.displayName} or in SHARED_CREDENTIALS. Workflow cannot run in production.`,
        });
        continue;
      }
      if (found.env !== 'production') {
        failures.push({
          nodeName: node.name ?? '(unknown)',
          nodeType: node.type ?? '(unknown)',
          credentialType: credType,
          credentialId: credId,
          reason: `Credential "${found.name}" (id ${found.id}, serviceKey ${found.serviceKey}) is tagged env='${found.env}'. Production promotion requires env='production'.`,
        });
      }
    }
  }
  return failures;
}

/**
 * POST the workflow_promoted event to the Hub n8n-promote-callback Edge Function.
 * Fire-and-forget with up to 3 retries (exponential backoff: 500ms, 1500ms, 4500ms).
 * Failures are logged but never thrown — the n8n state is the source of truth and the user
 * has already been told whether promotion succeeded; a stale Hub view is recoverable via
 * the next /sync-hub cron tick or a manual refresh.
 */
function fireHubPromoteCallback(payload: Record<string, unknown>): void {
  const url = process.env.HUB_CALLBACK_URL;
  const secret = process.env.HUB_CALLBACK_SECRET;
  if (!url || !secret) {
    console.warn('[promote] HUB_CALLBACK_URL or HUB_CALLBACK_SECRET not set — skipping Hub callback');
    return;
  }
  const target = `${url}/n8n-promote-callback`;

  (async () => {
    const delays = [0, 500, 1500, 4500];
    for (let attempt = 0; attempt < delays.length; attempt++) {
      if (delays[attempt] > 0) {
        await new Promise(r => setTimeout(r, delays[attempt]));
      }
      try {
        const res = await fetch(target, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Hub-Secret': secret },
          body: JSON.stringify(payload),
        });
        if (res.ok) return;
        const text = await res.text().catch(() => '');
        console.warn(`[promote] Hub callback attempt ${attempt + 1} failed (${res.status}): ${text.slice(0, 200)}`);
      } catch (err) {
        console.warn(`[promote] Hub callback attempt ${attempt + 1} threw: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    console.error('[promote] Hub callback failed after 4 attempts; manual sync may be required.');
  })();
}
