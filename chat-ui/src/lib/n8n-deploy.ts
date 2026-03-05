/**
 * n8n Deployment Client
 *
 * Deploys workflow JSON directly to the Guesty n8n Cloud instance.
 * Created workflows are:
 *   - Tagged "AI Generated" (tag id: 8pUFynxIQ58Bfpba) via separate tags endpoint
 *   - Created inactive (user activates manually)
 *   - Named with [AI] prefix for easy identification
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
 * Deploy a workflow JSON string to the n8n instance.
 * Returns DeployResult on success or DeployError on failure.
 */
export async function deployWorkflow(
  workflowJson: string,
  customName?: string
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

  // Ensure name has [AI] prefix; strip existing id so n8n creates a new one
  const baseName = customName ?? parsed.name ?? 'Untitled Workflow';
  const name = baseName.startsWith('[AI]') ? baseName : `[AI] ${baseName}`;

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

  return {
    workflowId,
    workflowUrl: `${N8N_API_URL}/workflow/${workflowId}`,
    workflowName: created.name,
  };
}

/**
 * Update an existing workflow by id.
 */
export async function updateWorkflow(
  workflowId: string,
  workflowJson: string
): Promise<DeployResult | DeployError> {
  let parsed: N8nWorkflow;

  try {
    parsed = JSON.parse(workflowJson) as N8nWorkflow;
  } catch {
    return { error: 'Invalid JSON — cannot parse workflow' };
  }

  const payload: N8nWorkflow = {
    name: parsed.name ?? '[AI] Workflow',
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

  return {
    workflowId: updated.id,
    workflowUrl: `${N8N_API_URL}/workflow/${updated.id}`,
    workflowName: updated.name,
  };
}
