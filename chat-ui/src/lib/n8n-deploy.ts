/**
 * n8n Deployment Client
 *
 * Deploys workflow JSON directly to the Guesty n8n Cloud instance.
 * Created workflows are:
 *   - Tagged "AI Generated" (tag id: 8pUFynxIQ58Bfpba) via separate tags endpoint
 *   - Created inactive (user activates manually)
 *   - Named "Workflow Name – @owner_handle" (handle = email prefix). The AI Generated
 *     tag does the AI-vs-human filtering, so no [AI by ...] prefix is added.
 */

const N8N_API_URL = (process.env.N8N_API_URL ?? 'https://guesty.app.n8n.cloud').replace(/\/$/, '');
const N8N_API_KEY = process.env.N8N_API_KEY ?? '';
const AI_GENERATED_TAG_ID = '8pUFynxIQ58Bfpba';

interface N8nWorkflow {
  id?: string;
  name: string;
  nodes: unknown[];
  connections: Record<string, unknown>;
  settings?: Record<string, unknown>;
}

export interface DeployResult {
  workflowId: string;
  workflowUrl: string;
  workflowName: string;
  transferStatus?: 'ok' | 'failed' | 'skipped';
  transferError?: string;
}

export interface DeployError {
  error: string;
  detail?: string;
}

function n8nHeaders() {
  return {
    'X-N8N-API-KEY': N8N_API_KEY,
    'Content-Type': 'application/json',
  };
}

/** Apply "AI Generated" tag to an existing workflow (separate API call). */
async function tagWorkflow(workflowId: string): Promise<void> {
  await fetch(`${N8N_API_URL}/api/v1/workflows/${workflowId}/tags`, {
    method: 'PUT',
    headers: n8nHeaders(),
    body: JSON.stringify([{ id: AI_GENERATED_TAG_ID }]),
  }).catch(() => { /* tagging is best-effort — don't fail the deploy */ });
}

/**
 * Activate an existing workflow. Used by the promote-to-production flow to flip the workflow
 * live after it's been transferred to the production project.
 *
 * Tries POST /api/v1/workflows/:id/activate first (modern n8n cloud API). Falls back to
 * PATCH /api/v1/workflows/:id with { active: true } if the dedicated endpoint 404s on this
 * n8n version. Returns the same { status, error? } shape as transferWorkflowToProject for
 * consistency.
 */
export async function activateWorkflow(workflowId: string): Promise<{ status: 'ok' | 'failed'; error?: string }> {
  // Try the dedicated activate endpoint first
  try {
    const res = await fetch(`${N8N_API_URL}/api/v1/workflows/${workflowId}/activate`, {
      method: 'POST',
      headers: n8nHeaders(),
    });
    if (res.ok || res.status === 204) {
      return { status: 'ok' };
    }
    // 404 → fall through to PATCH fallback. Other non-2xx → return as failure.
    if (res.status !== 404) {
      const text = await res.text().catch(() => '');
      const error = `Activate (POST) failed (${res.status}): ${text}`;
      console.warn(`[n8n-deploy] ${error}`);
      return { status: 'failed', error };
    }
  } catch (err) {
    const error = `Activate (POST) network error: ${err instanceof Error ? err.message : String(err)}`;
    console.warn(`[n8n-deploy] ${error}`);
    // Fall through to PATCH fallback rather than fail outright — network blips can affect
    // either path and the second attempt may succeed.
  }

  // Fallback: PATCH /workflows/:id with { active: true }
  try {
    const res = await fetch(`${N8N_API_URL}/api/v1/workflows/${workflowId}`, {
      method: 'PATCH',
      headers: n8nHeaders(),
      body: JSON.stringify({ active: true }),
    });
    if (res.ok || res.status === 204) {
      return { status: 'ok' };
    }
    const text = await res.text().catch(() => '');
    const error = `Activate (PATCH) failed (${res.status}): ${text}`;
    console.warn(`[n8n-deploy] ${error}`);
    return { status: 'failed', error };
  } catch (err) {
    const error = `Activate (PATCH) network error: ${err instanceof Error ? err.message : String(err)}`;
    console.warn(`[n8n-deploy] ${error}`);
    return { status: 'failed', error };
  }
}

/**
 * Detect whether a workflow JSON has any node that exposes a public webhook URL.
 *
 * Used by /api/promote to default `activate=false` when a webhook is present — flipping
 * a webhook live the moment of promotion would expose its URL to public traffic before the
 * downstream consumer is wired up. Pure function, no API calls.
 */
export function hasWebhookTrigger(workflowJson: string): boolean {
  let parsed: { nodes?: Array<{ type?: string }> };
  try {
    parsed = JSON.parse(workflowJson);
  } catch {
    return false;
  }
  if (!parsed.nodes || !Array.isArray(parsed.nodes)) return false;
  const WEBHOOK_NODE_TYPES = new Set([
    'n8n-nodes-base.webhook',
    'n8n-nodes-base.formTrigger',
    'n8n-nodes-base.formAction',
    '@n8n/n8n-nodes-langchain.chatTrigger',
  ]);
  return parsed.nodes.some(n => typeof n.type === 'string' && WEBHOOK_NODE_TYPES.has(n.type));
}

/**
 * Fetch a workflow's full JSON from n8n. Used by the promote-mode chat tool to load the
 * linked workflow into context so the checklist can inspect credentials, schedule, etc.
 *
 * Returns the JSON as a string (ready to feed back into the chat) or an error message.
 */
export async function getWorkflowJson(workflowId: string): Promise<{ json?: string; error?: string }> {
  try {
    const res = await fetch(`${N8N_API_URL}/api/v1/workflows/${workflowId}`, {
      method: 'GET',
      headers: n8nHeaders(),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return { error: `n8n API ${res.status}: ${text || 'fetch failed'}` };
    }
    const json = await res.text();
    return { json };
  } catch (err) {
    return { error: `Network error: ${err instanceof Error ? err.message : String(err)}` };
  }
}

/** Transfer a workflow to a specific n8n project. Returns status for UI feedback. */
async function transferWorkflowToProject(workflowId: string, projectId: string): Promise<{ status: 'ok' | 'failed'; error?: string }> {
  try {
    const res = await fetch(`${N8N_API_URL}/api/v1/workflows/${workflowId}/transfer`, {
      method: 'PUT',
      headers: n8nHeaders(),
      body: JSON.stringify({ destinationProjectId: projectId }),
    });

    if (res.ok || res.status === 204) {
      return { status: 'ok' };
    }

    const text = await res.text().catch(() => '');
    const error = `Transfer failed (${res.status}): ${text}`;
    console.warn(`[n8n-deploy] ${error}`);
    return { status: 'failed', error };
  } catch (err) {
    const error = `Transfer network error: ${err instanceof Error ? err.message : String(err)}`;
    console.warn(`[n8n-deploy] ${error}`);
    return { status: 'failed', error };
  }
}

/**
 * Deploy a workflow JSON string to the n8n instance.
 * Returns DeployResult on success or DeployError on failure.
 */
export async function deployWorkflow(
  workflowJson: string,
  customName?: string,
  userEmail?: string,
  projectId?: string,
): Promise<DeployResult | DeployError> {
  let parsed: N8nWorkflow;

  try {
    parsed = JSON.parse(workflowJson) as N8nWorkflow;
  } catch {
    return { error: 'Invalid JSON — cannot parse workflow' };
  }

  // Validate minimal structure
  if (!parsed.nodes || !Array.isArray(parsed.nodes)) {
    return { error: 'Invalid workflow JSON — missing nodes array' };
  }
  if (!parsed.connections || typeof parsed.connections !== 'object') {
    return { error: 'Invalid workflow JSON — missing connections object' };
  }

  // Ensure name carries an "@owner_handle" suffix; strip existing id so n8n creates a new one.
  // If the name already includes "@" the AI provided the suffix itself — pass through unchanged.
  // Strip any legacy "[AI by ...]" prefix the model may still emit.
  const handle = userEmail ? userEmail.split('@')[0] : 'unknown';
  const rawBaseName = customName ?? parsed.name ?? 'Untitled Workflow';
  const baseName = rawBaseName.replace(/^\[AI by [^\]]+\]\s*/, '').trim() || 'Untitled Workflow';
  const name = baseName.includes('@') ? baseName : `${baseName} – @${handle}`;

  const payload: N8nWorkflow = {
    name,
    nodes: parsed.nodes,
    connections: parsed.connections,
    settings: {
      ...(parsed.settings ?? {}),
      executionOrder: 'v1',
    },
  };

  // Remove id — always create fresh
  delete payload.id;

  const res = await fetch(`${N8N_API_URL}/api/v1/workflows`, {
    method: 'POST',
    headers: n8nHeaders(),
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    let detail = text;
    try {
      const j = JSON.parse(text) as { message?: string };
      detail = j.message ?? text;
    } catch { /* ignore */ }
    return { error: `n8n API error ${res.status}`, detail };
  }

  const created = (await res.json()) as { id: string; name: string };
  const workflowId = created.id;

  // Tag as "AI Generated" (best-effort, separate call)
  await tagWorkflow(workflowId);

  // Transfer to department project
  let transferStatus: 'ok' | 'failed' | 'skipped' = 'skipped';
  let transferError: string | undefined;
  if (projectId) {
    const transfer = await transferWorkflowToProject(workflowId, projectId);
    transferStatus = transfer.status;
    transferError = transfer.error;
  }

  return {
    workflowId,
    workflowUrl: `${N8N_API_URL}/workflow/${workflowId}`,
    workflowName: created.name,
    transferStatus,
    transferError,
  };
}

/**
 * Update an existing workflow by id.
 */
export async function updateWorkflow(
  workflowId: string,
  workflowJson: string,
  userEmail?: string,
  projectId?: string,
): Promise<DeployResult | DeployError> {
  let parsed: N8nWorkflow;

  try {
    parsed = JSON.parse(workflowJson) as N8nWorkflow;
  } catch {
    return { error: 'Invalid JSON — cannot parse workflow' };
  }

  const updateHandle = userEmail ? userEmail.split('@')[0] : 'unknown';
  const rawUpdateName = parsed.name ?? 'Workflow';
  const updateBaseName = rawUpdateName.replace(/^\[AI by [^\]]+\]\s*/, '').trim() || 'Workflow';
  const updateName = updateBaseName.includes('@') ? updateBaseName : `${updateBaseName} – @${updateHandle}`;

  const payload: N8nWorkflow = {
    name: updateName,
    nodes: parsed.nodes,
    connections: parsed.connections,
    settings: {
      ...(parsed.settings ?? {}),
      executionOrder: 'v1',
    },
  };

  const res = await fetch(`${N8N_API_URL}/api/v1/workflows/${workflowId}`, {
    method: 'PUT',
    headers: n8nHeaders(),
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    let detail = text;
    try {
      const j = JSON.parse(text) as { message?: string };
      detail = j.message ?? text;
    } catch { /* ignore */ }
    return { error: `n8n API error ${res.status}`, detail };
  }

  const updated = (await res.json()) as { id: string; name: string };
  await tagWorkflow(updated.id);

  // Transfer to department project if provided
  let transferStatus: 'ok' | 'failed' | 'skipped' = 'skipped';
  let transferError: string | undefined;
  if (projectId) {
    const transfer = await transferWorkflowToProject(updated.id, projectId);
    transferStatus = transfer.status;
    transferError = transfer.error;
  }

  return {
    workflowId: updated.id,
    workflowUrl: `${N8N_API_URL}/workflow/${updated.id}`,
    workflowName: updated.name,
    transferStatus,
    transferError,
  };
}
