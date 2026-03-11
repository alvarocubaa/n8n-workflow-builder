/**
 * n8n Deployment Client
 *
 * Deploys workflow JSON directly to the Guesty n8n Cloud instance.
 * Created workflows are:
 *   - Tagged "AI Generated" (tag id: 8pUFynxIQ58Bfpba) via separate tags endpoint
 *   - Created inactive (user activates manually)
 *   - Named with [AI by username] prefix for easy identification
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

  // Ensure name has [AI by user] prefix; strip existing id so n8n creates a new one
  const username = userEmail ? userEmail.split('@')[0] : 'unknown';
  const baseName = customName ?? parsed.name ?? 'Untitled Workflow';
  const aiPrefix = `[AI by ${username}]`;
  const name = baseName.startsWith('[AI') ? baseName : `${aiPrefix} ${baseName}`;

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

  const updateUsername = userEmail ? userEmail.split('@')[0] : 'unknown';
  const updateBaseName = parsed.name ?? 'Workflow';
  const updateName = updateBaseName.startsWith('[AI') ? updateBaseName : `[AI by ${updateUsername}] ${updateBaseName}`;

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
