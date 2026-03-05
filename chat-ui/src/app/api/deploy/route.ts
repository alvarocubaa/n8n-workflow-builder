import { getUserFromHeaders } from '@/lib/auth';
import { deployWorkflow, updateWorkflow } from '@/lib/n8n-deploy';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/deploy
 *
 * Body: { workflowJson: string, workflowId?: string, name?: string }
 *
 * If workflowId is provided → update existing workflow.
 * Otherwise → create a new workflow tagged "AI Generated".
 *
 * Returns: { workflowId, workflowUrl, workflowName } or { error, detail }
 */
export async function POST(req: Request): Promise<Response> {
  const user = getUserFromHeaders(req.headers);
  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { workflowJson?: string; workflowId?: string; name?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { workflowJson, workflowId, name } = body;
  if (!workflowJson?.trim()) {
    return Response.json({ error: 'workflowJson is required' }, { status: 400 });
  }

  const result = workflowId
    ? await updateWorkflow(workflowId, workflowJson)
    : await deployWorkflow(workflowJson, name);

  if ('error' in result) {
    return Response.json(result, { status: 422 });
  }

  return Response.json(result);
}
