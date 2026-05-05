import { getUserFromRequest } from '@/lib/auth';
import { deployWorkflow, updateWorkflow } from '@/lib/n8n-deploy';
import { logDeployEvent, getConversation } from '@/lib/firestore';
import { computeComplexity, extractWorkflowMeta } from '@/lib/complexity';
import { getDepartment } from '@/lib/departments';

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
  const user = await getUserFromRequest(req);
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

  const dept = body.departmentId ? getDepartment(body.departmentId) : undefined;
  const projectId = dept?.n8nProjectId;

  const result = workflowId
    ? await updateWorkflow(workflowId, workflowJson, user.email, projectId)
    : await deployWorkflow(workflowJson, name, user.email, projectId);

  if ('error' in result) {
    // Log deploy failure for analytics visibility (fire-and-forget)
    const failMeta = extractWorkflowMeta(workflowJson);
    logDeployEvent({
      userEmail: user.email,
      departmentId: body.departmentId ?? 'unknown',
      conversationId: body.conversationId ?? '',
      workflowId: '',
      workflowUrl: '',
      workflowName: `[FAILED] ${result.detail ?? result.error}`,
      nodeCount: failMeta.nodeCount,
      nodeTypes: failMeta.nodeTypes,
      hasSqlQuery: failMeta.hasSqlQuery,
      complexityScore: 0,
      estimatedHoursSaved: 0,
      estimatedValueUsd: 0,
      createdAt: new Date().toISOString(),
    }).catch(console.error);
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

  // Hub × n8n-builder integration: if this deploy belongs to a conversation that
  // was launched from a Hub initiative, auto-link the workflow back to that initiative.
  // Fire-and-forget — Hub being down must NOT fail the deploy.
  if (body.conversationId && process.env.HUB_CALLBACK_URL && process.env.HUB_CALLBACK_SECRET) {
    (async () => {
      try {
        const conv = await getConversation(user.email, body.conversationId!);
        // Direction-3 defense: refuse to write back if this conversation was
        // never tied to the Hub. `source === 'standalone'` should be impossible
        // when initiativeId is set (paired by the chat-ui server), but reject
        // explicitly anyway.
        if (conv?.initiativeId && conv.source && conv.source !== 'standalone') {
          await fetch(`${process.env.HUB_CALLBACK_URL}/n8n-builder-callback`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Hub-Secret': process.env.HUB_CALLBACK_SECRET!,
            },
            body: JSON.stringify({
              initiative_id: conv.initiativeId,
              n8n_workflow_id: result.workflowId,
              n8n_workflow_name: result.workflowName,
              deployed_by: user.email,
              deployed_at: new Date().toISOString(),
              source: conv.source,
            }),
          });
        }
      } catch (err) {
        console.error('Hub builder-callback failed:', err);
      }
    })();
  }

  return Response.json(result);
}
