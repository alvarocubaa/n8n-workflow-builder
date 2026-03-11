import { AnthropicVertex } from '@anthropic-ai/vertex-sdk';
import type {
  Tool,
  MessageParam,
  TextBlockParam,
  ToolUseBlockParam,
  ToolResultBlockParam,
} from '@anthropic-ai/sdk/resources/messages';
import { callMcpTool, type RawMcpTool } from './mcp-bridge';
import { getSystemPrompt } from './system-prompt';
import { readSkill, readCompanySpec } from './knowledge';
import { getDepartment, getDepartmentSpecKeys } from './departments';
import type { ChatEvent } from './types';

const CLAUDE_MODEL = process.env.CLAUDE_MODEL ?? 'claude-sonnet-4-6';
const GCP_PROJECT  = process.env.GCP_PROJECT_ID ?? 'agentic-workflows-485210';
// Claude models on Vertex AI are only available in us-east5
const VERTEX_REGION = 'us-east5';

// ─── Knowledge tools (local file reads — no MCP round-trip) ─────────────────

const ALL_SPEC_KEYS = ['salesforce', 'zendesk', 'jira', 'hubspot', 'csm', 'zuora', 'hibob', 'siit', 'gus', 'admin_data', 'marketplace', 'credentials', 'join_map'];

/** Returns knowledge tools with get_company_spec enum scoped to the department. */
function getKnowledgeTools(departmentId?: string): Tool[] {
  const dept = departmentId ? getDepartment(departmentId) : undefined;
  const specEnum = dept ? getDepartmentSpecKeys(dept) : ALL_SPEC_KEYS;

  return [
    {
      name: 'get_n8n_skill',
      description:
        'Load an n8n expert guide covering detailed rules, syntax, and examples for a specific topic. Use when you need authoritative reference beyond what the system prompt provides — e.g., unfamiliar validation errors, Code node syntax, or complex workflow patterns.',
      input_schema: {
        type: 'object',
        properties: {
          skill: {
            type: 'string',
            description: 'Topic to load',
            enum: ['javascript', 'python', 'expressions', 'mcp_tools', 'node_config', 'validation', 'patterns'],
          },
          file: {
            type: 'string',
            description: 'Optional: load a specific reference file instead of the main guide. The main guide lists available files.',
          },
        },
        required: ['skill'],
      },
    },
    {
      name: 'get_company_spec',
      description:
        'Load Guesty-specific configuration for a company system — credential names, field mappings, BigQuery table paths, API endpoints, and verified SQL patterns. Call this for each system the workflow interacts with.',
      input_schema: {
        type: 'object',
        properties: {
          system: {
            type: 'string',
            description: 'System name',
            enum: specEnum,
          },
        },
        required: ['system'],
      },
    },
  ];
}

function handleKnowledgeTool(name: string, args: Record<string, unknown>, departmentId?: string): string | null {
  if (name === 'get_n8n_skill') return readSkill(args.skill as string, args.file as string | undefined);
  if (name === 'get_company_spec') return readCompanySpec(args.system as string, departmentId);
  return null;
}

function rawToAnthropicTool(tool: RawMcpTool): Tool {
  return {
    name: tool.name,
    description: tool.description ?? tool.name,
    input_schema: (tool.inputSchema as Tool['input_schema']) ?? { type: 'object', properties: {} },
  };
}

function getClient(): AnthropicVertex {
  return new AnthropicVertex({ region: VERTEX_REGION, projectId: GCP_PROJECT });
}

// ─── Agentic streaming loop ───────────────────────────────────────────────────

/**
 * Streams a chat turn through Claude (via Vertex AI) with an agentic tool-call loop.
 * Uses prompt caching (cache_control: ephemeral) on the system prompt to reduce
 * latency and token cost on subsequent messages within the same conversation.
 */
export async function* streamWorkflowChat(
  history: Array<{ role: 'user' | 'model'; content: string }>,
  userMessage: string,
  rawTools: RawMcpTool[],
  departmentId?: string,
): AsyncGenerator<ChatEvent> {
  const client = getClient();

  const allTools: Tool[] = [...getKnowledgeTools(departmentId), ...rawTools.map(rawToAnthropicTool)];

  // Claude uses 'assistant' not 'model'
  const messages: MessageParam[] = [
    ...history.map(m => ({
      role: (m.role === 'model' ? 'assistant' : 'user') as 'user' | 'assistant',
      content: m.content,
    })),
    { role: 'user', content: userMessage },
  ];

  while (true) {
    const stream = await client.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 8192,
      temperature: 0.1,
      system: [
        {
          type: 'text',
          text: getSystemPrompt(),
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages,
      tools: allTools,
      stream: true,
    });

    const toolUses: Array<{ id: string; name: string; inputJson: string }> = [];
    let currentToolIdx = -1;
    const textParts: string[] = [];

    for await (const event of stream) {
      if (event.type === 'content_block_start') {
        if (event.content_block.type === 'tool_use') {
          toolUses.push({ id: event.content_block.id, name: event.content_block.name, inputJson: '' });
          currentToolIdx = toolUses.length - 1;
        }
      } else if (event.type === 'content_block_delta') {
        if (event.delta.type === 'text_delta') {
          yield { type: 'text_chunk', text: event.delta.text };
          textParts.push(event.delta.text);
        } else if (event.delta.type === 'input_json_delta' && currentToolIdx >= 0) {
          toolUses[currentToolIdx].inputJson += event.delta.partial_json;
        }
      }
    }

    if (toolUses.length === 0) {
      yield { type: 'done' };
      return;
    }

    // Build assistant message content (text + tool_use blocks) for the next turn
    const assistantContent: Array<TextBlockParam | ToolUseBlockParam> = [];
    if (textParts.length > 0) {
      assistantContent.push({ type: 'text', text: textParts.join('') });
    }

    const toolResults: ToolResultBlockParam[] = [];

    for (const tu of toolUses) {
      let args: Record<string, unknown> = {};
      try { args = JSON.parse(tu.inputJson || '{}'); } catch { /* leave empty */ }

      assistantContent.push({ type: 'tool_use', id: tu.id, name: tu.name, input: args });

      yield { type: 'tool_call', name: tu.name, args };

      let result: string;
      try {
        const local = handleKnowledgeTool(tu.name, args, departmentId);
        result = local ?? await callMcpTool(tu.name, args);
      } catch (err) {
        result = `Error executing ${tu.name}: ${String(err)}`;
      }

      toolResults.push({ type: 'tool_result', tool_use_id: tu.id, content: result });
    }

    messages.push({ role: 'assistant', content: assistantContent });
    messages.push({ role: 'user', content: toolResults });
  }
}
