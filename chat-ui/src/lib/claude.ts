import { AnthropicVertex } from '@anthropic-ai/vertex-sdk';
import type {
  Tool,
  MessageParam,
  TextBlockParam,
  ToolUseBlockParam,
  ToolResultBlockParam,
  DocumentBlockParam,
  ContentBlockParam,
} from '@anthropic-ai/sdk/resources/messages';
import { callMcpTool, type RawMcpTool } from './mcp-bridge';
import { getSystemPrompt } from './system-prompt';
import { readSkill, readCompanySpec } from './knowledge';
import { getDepartment, getDepartmentSpecKeys } from './departments';
import type { AssistantMode, ChatEvent, TokenUsage } from './types';

const CLAUDE_MODEL = process.env.CLAUDE_MODEL ?? 'claude-sonnet-4-6';

// ─── MCP result sanitization ─────────────────────────────────────────────────
// Strip credential blocks from MCP tool results (search_nodes, get_node) so the
// AI doesn't copy stale credential IDs from existing workflows. The correct
// credentials are provided via department context — MCP creds are never useful.
// Added in v0.19 to fix systemic stale-credential issue.
const MCP_TOOLS_TO_STRIP_CREDS = new Set(['search_nodes', 'get_node', 'get_template']);

function stripCredentialsFromResult(toolName: string, result: string): string {
  if (!MCP_TOOLS_TO_STRIP_CREDS.has(toolName)) return result;
  try {
    const parsed = JSON.parse(result);
    const stripped = JSON.parse(JSON.stringify(parsed, (key, value) => {
      if (key === 'credentials' && typeof value === 'object' && value !== null) {
        return '[credentials removed — use department config]';
      }
      return value;
    }));
    return JSON.stringify(stripped);
  } catch {
    // If not valid JSON, use regex fallback for credential blocks
    return result.replace(/"credentials"\s*:\s*\{[^}]*\}/g,
      '"credentials": "[use department config]"');
  }
}
const GCP_PROJECT  = process.env.GCP_PROJECT_ID ?? 'agentic-workflows-485210';
// Claude models on Vertex AI are only available in us-east5
const VERTEX_REGION = 'us-east5';

// ─── Knowledge tools (local file reads — no MCP round-trip) ─────────────────

const ALL_SPEC_KEYS = ['salesforce', 'zendesk', 'jira', 'hubspot', 'csm', 'zuora', 'hibob', 'siit', 'gus', 'admin_data', 'marketplace', 'credentials', 'join_map'];

/** Returns knowledge tools with get_company_spec enum scoped to the department and mode. */
function getKnowledgeTools(departmentId?: string, mode: AssistantMode = 'builder'): Tool[] {
  const dept = departmentId ? getDepartment(departmentId) : undefined;
  const specEnum = dept ? getDepartmentSpecKeys(dept) : ALL_SPEC_KEYS;

  const tools: Tool[] = [];

  // get_n8n_skill is only available in builder mode (data mode doesn't build workflows)
  if (mode === 'builder') {
    tools.push({
      name: 'get_n8n_skill',
      description:
        'Load an n8n expert guide covering detailed rules, syntax, and examples for a specific topic. Use when you need authoritative reference beyond what the system prompt provides — e.g., unfamiliar validation errors, Code node syntax, or complex workflow patterns.',
      input_schema: {
        type: 'object',
        properties: {
          skill: {
            type: 'string',
            description: 'Topic to load',
            enum: ['javascript', 'python', 'expressions', 'mcp_tools', 'node_config', 'validation', 'patterns', 'ai_nodes'],
          },
          file: {
            type: 'string',
            description: 'Optional: load a specific reference file instead of the main guide. The main guide lists available files.',
          },
        },
        required: ['skill'],
      },
    });
  }

  const specDescription = mode === 'data'
    ? 'Load Guesty data source specification — table schemas, column descriptions, BigQuery paths, verified SQL examples, and join conditions. Call this for each system relevant to the question.'
    : 'Load Guesty-specific configuration for a company system — credential names, field mappings, BigQuery table paths, API endpoints, and verified SQL patterns. Call this for each system the workflow interacts with.';

  tools.push({
    name: 'get_company_spec',
    description: specDescription,
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
  });

  return tools;
}

/** MCP tools allowed in data mode (read-only, for understanding node capabilities). */
const DATA_MODE_MCP_TOOLS = new Set(['search_nodes', 'get_node']);

/** Filter MCP tools based on assistant mode. Builder gets all; data gets a subset. */
function filterMcpToolsForMode(tools: Tool[], mode: AssistantMode): Tool[] {
  if (mode === 'builder') return tools;
  return tools.filter(t => DATA_MODE_MCP_TOOLS.has(t.name));
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

// ─── Context window management ───────────────────────────────────────────────

/** Threshold (in tokens) above which we apply context windowing. */
const CONTEXT_TOKEN_THRESHOLD = 80_000;
/** Minimum history length before we even check tokens (skip overhead for short convos). */
const MIN_HISTORY_FOR_WINDOWING = 16;
/** Number of recent messages to keep in the sliding window. */
const RECENT_WINDOW_SIZE = 12;
/** Number of messages to pin from the start (Phase 1 context). */
const PINNED_START_SIZE = 2;

/**
 * Manages context window for long conversations.
 * Strategy: Pin first 2 messages (Phase 1 user request + AI plan) + keep last 12 messages.
 * Only activates when history exceeds MIN_HISTORY_FOR_WINDOWING messages AND
 * token count exceeds CONTEXT_TOKEN_THRESHOLD.
 *
 * Returns { messages, windowed } — windowed=true if context was trimmed.
 */
export async function manageContext(
  history: Array<{ role: 'user' | 'model'; content: string; toolContext?: string }>,
  mode: AssistantMode = 'builder',
): Promise<{ messages: typeof history; windowed: boolean; inputTokens?: number }> {
  // Short conversations: no action
  if (history.length <= MIN_HISTORY_FOR_WINDOWING) {
    return { messages: history, windowed: false };
  }

  // Count tokens to decide if windowing is needed
  // Note: we omit tools from counting (~3K constant) — threshold has margin for this.
  const client = getClient();
  let inputTokens: number;
  try {
    const msgParams: MessageParam[] = history.map(m => ({
      role: (m.role === 'model' ? 'assistant' : 'user') as 'user' | 'assistant',
      content: m.role === 'model' && m.toolContext ? m.content + m.toolContext : m.content,
    }));

    const result = await client.messages.countTokens({
      model: CLAUDE_MODEL,
      system: [{ type: 'text', text: getSystemPrompt(mode) }],
      messages: msgParams,
    });
    inputTokens = result.input_tokens;
  } catch (err) {
    // If countTokens fails, skip windowing (graceful degradation)
    console.error('countTokens failed, skipping context windowing:', err);
    return { messages: history, windowed: false };
  }

  // Under threshold: no action
  if (inputTokens < CONTEXT_TOKEN_THRESHOLD) {
    return { messages: history, windowed: false, inputTokens };
  }

  // Pin first messages (Phase 1 context), slide the rest.
  // Ensure recent window starts on a 'user' message to maintain strict
  // user/assistant alternation (pinned ends with 'model').
  const pinned = history.slice(0, PINNED_START_SIZE);
  let recentStart = Math.max(PINNED_START_SIZE, history.length - RECENT_WINDOW_SIZE);
  if (recentStart < history.length && history[recentStart].role !== 'user') {
    recentStart = Math.min(recentStart + 1, history.length);
  }
  const recent = history.slice(recentStart);
  const dropped = recentStart - PINNED_START_SIZE;

  console.log(`Context windowing: ${inputTokens} tokens > ${CONTEXT_TOKEN_THRESHOLD} threshold, ${history.length} msgs → pinned ${PINNED_START_SIZE} + recent ${recent.length} (dropped ${dropped})`);

  // Prepend context note to the first message in the recent window
  // (instead of a separator message which would break role alternation)
  if (recent.length > 0 && dropped > 0) {
    recent[0] = {
      ...recent[0],
      content: `[Note: ${dropped} earlier messages were trimmed to manage context. The original requirements are preserved at the start of this conversation.]\n\n${recent[0].content}`,
    };
  }

  return {
    messages: [...pinned, ...recent],
    windowed: true,
    inputTokens,
  };
}

// ─── Tool context summaries (persisted across turns) ─────────────────────────

interface ToolCallRecord {
  name: string;
  args: Record<string, unknown>;
  result: string;
}

/**
 * Build a compact summary of tool calls made during a turn.
 * This gets persisted alongside the model response so Claude retains
 * awareness of loaded specs/skills/nodes across conversation turns.
 * Target: under ~500 tokens total.
 */
function buildToolSummary(calls: ToolCallRecord[]): string {
  if (calls.length === 0) return '';

  const lines: string[] = [];
  for (const c of calls) {
    if (c.name === 'get_company_spec') {
      lines.push(`[Loaded ${c.args.system} spec]`);
    } else if (c.name === 'get_n8n_skill') {
      const file = c.args.file ? ` (file: ${c.args.file})` : '';
      lines.push(`[Loaded ${c.args.skill} skill${file}]`);
    } else if (c.name === 'search_nodes') {
      // Extract first few results from the response
      const excerpt = c.result.substring(0, 200).replace(/\n/g, ' ');
      lines.push(`[search_nodes(${JSON.stringify(c.args.query ?? c.args.keyword ?? '')}): ${excerpt}]`);
    } else if (c.name === 'get_node') {
      lines.push(`[get_node(${c.args.nodeType}): loaded config]`);
    } else if (c.name === 'validate_node' || c.name === 'validate_workflow') {
      // Count errors/warnings from validation result
      const errCount = (c.result.match(/"severity"\s*:\s*"error"/g) || []).length;
      const warnCount = (c.result.match(/"severity"\s*:\s*"warning"/g) || []).length;
      lines.push(`[${c.name}: ${errCount} errors, ${warnCount} warnings]`);
    } else {
      // Generic MCP tool — just note it was called
      lines.push(`[${c.name}(${Object.keys(c.args).join(', ')})]`);
    }
  }

  return '\n\n[Tools used this turn: ' + lines.join(', ') + ']';
}

// ─── Agentic streaming loop ───────────────────────────────────────────────────

/**
 * Streams a chat turn through Claude (via Vertex AI) with an agentic tool-call loop.
 * Uses prompt caching (cache_control: ephemeral) on the system prompt to reduce
 * latency and token cost on subsequent messages within the same conversation.
 */
/** File attachment from the chat UI. */
export interface FileAttachment {
  name: string;
  content: string;
  encoding: 'text' | 'base64';
  mediaType: string;
}

export async function* streamWorkflowChat(
  history: Array<{ role: 'user' | 'model'; content: string; toolContext?: string }>,
  userMessage: string,
  rawTools: RawMcpTool[],
  departmentId?: string,
  file?: FileAttachment,
  mode: AssistantMode = 'builder',
): AsyncGenerator<ChatEvent> {
  const client = getClient();

  const mcpTools = filterMcpToolsForMode(rawTools.map(rawToAnthropicTool), mode);
  const allTools: Tool[] = [...getKnowledgeTools(departmentId, mode), ...mcpTools];

  // Build the current user message content — may include file as a document block
  let userContent: string | ContentBlockParam[];
  if (file) {
    const blocks: ContentBlockParam[] = [];
    if (file.encoding === 'base64' && file.mediaType === 'application/pdf') {
      // PDF: send as document block — Claude processes natively
      blocks.push({
        type: 'document',
        source: { type: 'base64', media_type: 'application/pdf', data: file.content },
        title: file.name,
      } as DocumentBlockParam);
    } else {
      // Text file: send as document with plain text source
      blocks.push({
        type: 'document',
        source: { type: 'text', media_type: 'text/plain', data: file.content },
        title: file.name,
      } as DocumentBlockParam);
    }
    blocks.push({ type: 'text', text: userMessage });
    userContent = blocks;
  } else {
    userContent = userMessage;
  }

  // Claude uses 'assistant' not 'model'
  // When toolContext exists on assistant messages, append it so Claude
  // retains awareness of specs/skills/nodes loaded in previous turns.
  const messages: MessageParam[] = [
    ...history.map(m => {
      const role = (m.role === 'model' ? 'assistant' : 'user') as 'user' | 'assistant';
      const content = m.role === 'model' && m.toolContext
        ? m.content + m.toolContext
        : m.content;
      return { role, content };
    }),
    { role: 'user', content: userContent },
  ];

  // ── Token usage tracking across all API calls in this turn ──
  const turnUsage: TokenUsage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };
  let turnTruncated = false;
  const turnToolCalls: ToolCallRecord[] = [];

  while (true) {
    const stream = await client.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 32768,
      temperature: 0.1,
      system: [
        {
          type: 'text',
          text: getSystemPrompt(mode),
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
      } else if (event.type === 'message_start') {
        // Capture initial usage from this API call
        const u = event.message?.usage;
        if (u) {
          turnUsage.inputTokens += u.input_tokens ?? 0;
          // Cache fields exist on the Usage type but may not be in the TS definitions
          const uAny = u as unknown as Record<string, number | null>;
          turnUsage.cacheReadTokens += uAny.cache_read_input_tokens ?? 0;
          turnUsage.cacheWriteTokens += uAny.cache_creation_input_tokens ?? 0;
        }
      } else if (event.type === 'message_delta') {
        // Capture output token count and stop_reason
        const delta = event as { delta?: { stop_reason?: string }; usage?: { output_tokens?: number } };
        if (delta.usage?.output_tokens) {
          turnUsage.outputTokens += delta.usage.output_tokens;
        }
        if (delta.delta?.stop_reason === 'max_tokens') {
          turnTruncated = true;
        }
      }
    }

    if (toolUses.length === 0) {
      if (turnTruncated) {
        yield { type: 'text_chunk', text: '\n\n---\n**Note:** This response was truncated due to length limits. Ask me to continue if the output is incomplete.' };
      }
      const toolSummary = buildToolSummary(turnToolCalls);
      yield { type: 'done', usage: turnUsage, truncated: turnTruncated, toolSummary: toolSummary || undefined };
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

      const sanitized = stripCredentialsFromResult(tu.name, result);
      toolResults.push({ type: 'tool_result', tool_use_id: tu.id, content: sanitized });

      // Record for tool summary (persisted across turns)
      turnToolCalls.push({ name: tu.name, args, result: sanitized });
    }

    messages.push({ role: 'assistant', content: assistantContent });
    messages.push({ role: 'user', content: toolResults });
  }
}
