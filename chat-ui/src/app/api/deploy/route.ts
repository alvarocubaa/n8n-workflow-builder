import { getUserFromHeaders } from '@/lib/auth';
import { deployWorkflow, updateWorkflow } from '@/lib/n8n-deploy';
import { logDeployEvent } from '@/lib/firestore';
import { computeComplexity, extractWorkflowMeta } from '@/lib/complexity';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/deploy
 *
 * Body: { workflowJson: string, workflowId?: string, name?: string,
 *         conversationId?: string, departmentId?: string }
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

  let body: {
    workflowJson?: string;
    workflowId?: string;
    name?: string;
    conversationId?: string;
    departmentId?: string;
  };
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

  // Log deploy analytics (fire-and-forget)
  const meta = extractWorkflowMeta(workflowJson);
  const roi = computeComplexity(workflowJson);
  logDeployEvent({
    userEmail: user.email,
    departmentId: body.departmentId ?? 'unknown',
    conversationId: body.conversationId ?? '',
    workflowId: result.workflowId,
    workflowUrl: result.workflowUrl,
    workflowName: result.workflowName,
    nodeCount: meta.nodeCount,
    nodeTypes: meta.nodeTypes,
    hasSqlQuery: meta.hasSqlQuery,
    complexityScore: roi.complexityScore,
    estimatedHoursSaved: roi.estimatedHoursSaved,
    estimatedValueUsd: roi.estimatedValueUsd,
    createdAt: new Date().toISOString(),
  }).catch(console.error);

  return Response.json(result);
}
