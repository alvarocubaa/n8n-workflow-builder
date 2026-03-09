import { getUserFromHeaders } from '@/lib/auth';
import { streamWorkflowChat } from '@/lib/claude';
import { getRawMcpTools, type RawMcpTool } from '@/lib/mcp-bridge';
import {
  createConversation,
  appendMessages,
  getConversation,
  logAnalyticsEvent,
  type DisplayMessage,
} from '@/lib/firestore';
import type { AnalyticsEvent } from '@/lib/types';
import {
  getDepartment,
  getDepartmentCredentialsMarkdown,
  DEFAULT_DEPARTMENT,
  type DepartmentConfig,
} from '@/lib/departments';
import type { ChatEvent } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Build an XML context block with department-scoped credentials and rules. */
function buildDepartmentContext(dept: DepartmentConfig): string {
  const credTable = getDepartmentCredentialsMarkdown(dept);
  const systems = dept.specs.join(', ');

  return `<department_context department="${dept.displayName}">
You are assisting a ${dept.displayName} team member. Scope your responses to these systems: ${systems}.

Available credentials for this department:
${credTable}

Use ONLY the credentials listed above when building workflow JSON.
${dept.promptRules ?? ''}
</department_context>`;
}

export async function POST(req: Request): Promise<Response> {
  const user = getUserFromHeaders(req.headers);
  if (!user) {
    return new Response('Unauthorized', { status: 401 });
  }

  let body: { message?: string; conversationId?: string; departmentId?: string };
  try {
    body = (await req.json()) as { message?: string; conversationId?: string; departmentId?: string };
  } catch {
    return new Response('Invalid JSON', { status: 400 });
  }

  const { message, conversationId: existingConvId } = body;
  if (!message?.trim()) {
    return new Response('message is required', { status: 400 });
  }

  // Resolve department
  let departmentId = body.departmentId ?? DEFAULT_DEPARTMENT;

  // Load or create the conversation
  let conversationId = existingConvId;
  let history: DisplayMessage[] = [];

  if (conversationId) {
    const conv = await getConversation(user.email, conversationId);
    if (conv) {
      history = conv.messages;
      // Use the conversation's stored department (not the request's)
      if (conv.departmentId) {
        departmentId = conv.departmentId;
      }
    } else {
      conversationId = undefined;
    }
  }

  if (!conversationId) {
    conversationId = await createConversation(user.email, message, departmentId);
  }

  const convId = conversationId; // narrowed — always defined from here on

  // Build department context prefix for the first message of new conversations
  const dept = getDepartment(departmentId);
  let enrichedMessage = message;
  if (!existingConvId && dept) {
    const contextPrefix = buildDepartmentContext(dept);
    enrichedMessage = `${contextPrefix}\n\n${message}`;
  }

  // Fetch n8n-mcp tools (cached)
  let rawTools: RawMcpTool[] = [];
  try {
    rawTools = await getRawMcpTools();
  } catch (err) {
    console.error('Failed to load MCP tools:', err);
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      function enqueue(event: ChatEvent & { conversationId?: string }) {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(event)}\n\n`)
        );
      }

      const modelChunks: string[] = [];
      const eventStream = streamWorkflowChat(history, enrichedMessage, rawTools, departmentId);

      // Analytics tracking
      const startTime = Date.now();
      const toolCallNames: string[] = [];

      try {
        for await (const event of eventStream) {
          if (event.type === 'text_chunk') {
            modelChunks.push(event.text);
            enqueue(event);
          } else if (event.type === 'tool_call') {
            toolCallNames.push(event.name);
            enqueue(event);
          } else if (event.type === 'done') {
            // Persist the user turn + model response
            const userMsg: DisplayMessage = {
              role: 'user',
              content: message,
              timestamp: new Date().toISOString(),
            };
            const modelMsg: DisplayMessage = {
              role: 'model',
              content: modelChunks.join(''),
              timestamp: new Date().toISOString(),
            };

            try {
              await appendMessages(user.email, convId, [userMsg, modelMsg]);
            } catch (err) {
              console.error('Failed to persist messages:', err);
            }

            // Log analytics event (fire-and-forget)
            const analyticsEvent: AnalyticsEvent = {
              userEmail: user.email,
              departmentId,
              conversationId: convId,
              turnNumber: Math.floor(history.length / 2) + 1,
              sessionStartedAt: new Date(startTime).toISOString(),
              latencyMs: Date.now() - startTime,
              toolCallCount: toolCallNames.length,
              toolCallNames,
              skillsLoaded: toolCallNames.filter(n => n === 'get_n8n_skill'),
              specsLoaded: toolCallNames.filter(n => n === 'get_company_spec'),
              createdAt: new Date().toISOString(),
            };
            logAnalyticsEvent(analyticsEvent).catch(console.error);

            enqueue({ type: 'done', conversationId: convId });
            controller.close();
            return;
          } else if (event.type === 'error') {
            enqueue(event);
            controller.close();
            return;
          }
        }
      } catch (err) {
        enqueue({ type: 'error', message: String(err) });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
