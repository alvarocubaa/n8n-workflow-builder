import { getUserFromRequest } from '@/lib/auth';
import { streamWorkflowChat, manageContext } from '@/lib/claude';
import { getRawMcpTools, type RawMcpTool } from '@/lib/mcp-bridge';
import {
  createConversation,
  appendMessages,
  getConversation,
  updateConversationInitiativeId,
  logAnalyticsEvent,
  type DisplayMessage,
} from '@/lib/firestore';
import type { AnalyticsEvent, AssistantMode, InitiativePrefill, PocContext, PromoteContext } from '@/lib/types';
import {
  getDepartment,
  getDepartmentCredentialsMarkdown,
  getDepartmentServiceKeyBlock,
  DEFAULT_DEPARTMENT,
  type DepartmentConfig,
} from '@/lib/departments';
import type { ChatEvent } from '@/lib/types';
import { callHubInitiativeUpsert, type InitiativeUpsertFields } from '@/lib/hub-callback';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Build an XML context block with department-scoped credentials and rules. */
function buildDepartmentContext(dept: DepartmentConfig, mode: AssistantMode = 'builder'): string {
  const systems = dept.specs.join(', ');

  if (mode === 'data') {
    // Data consultant mode: system list + rules only, no credential IDs
    return `<department_context department="${dept.displayName}">
You are assisting a ${dept.displayName} team member. Available data sources for this department: ${systems}.
${dept.promptRules ?? ''}
</department_context>`;
  }

  // Builder mode: full credentials + rules
  const credTable = getDepartmentCredentialsMarkdown(dept);
  const serviceKeyBlock = getDepartmentServiceKeyBlock(dept);
  const prodProjectLine = dept.n8nProductionProjectId
    ? `\nProduction n8n project for promote-to-production flow: ${dept.n8nProductionProjectId}`
    : '\nNo production n8n project configured for this department — workflows cannot promote to production via the AI Builder.';
  return `<department_context department="${dept.displayName}">
You are assisting a ${dept.displayName} team member. Scope your responses to these systems: ${systems}.${prodProjectLine}

Available credentials for this department:
${credTable}

${serviceKeyBlock}

Use ONLY the credentials listed above when building workflow JSON.
${dept.promptRules ?? ''}
</department_context>`;
}

/**
 * Build an XML <initiative_context> block from a Hub-supplied prefill payload.
 * Prepended BEFORE <department_context> in the first user message because the
 * initiative is the higher-level frame for the whole conversation.
 *
 * Two modes:
 *   - building : restate the initiative + ask Claude to translate it to a workflow
 *   - planning : interview the user about field gaps; propose form-population JSON at end
 */
function buildInitiativeContext(prefill: InitiativePrefill): string {
  const m = prefill.initiative_metadata;
  const lines = [
    `Initiative ID: ${prefill.initiative_id}`,
    `Title: ${m.title}`,
    m.improvement_kpi ? `KPI: ${m.improvement_kpi}` : null,
    m.business_justification ? `Business justification: ${m.business_justification}` : null,
    m.current_state ? `Current state: ${m.current_state}` : null,
    m.data_sources ? `Data sources mentioned: ${m.data_sources}` : null,
    m.department ? `Department: ${m.department}` : null,
    `Hub: ${m.hub_url}`,
  ]
    .filter(Boolean)
    .join('\n');

  const draftBlock = prefill.initiative_draft
    ? `\n\nDraft (so far):\n${JSON.stringify(prefill.initiative_draft, null, 2)}`
    : '';

  if (prefill.mode === 'planning') {
    return `<initiative_context mode="planning" initiative_id="${prefill.initiative_id}">
${lines}${draftBlock}

You are in PLANNING mode. The user is drafting this initiative in the Hub and clicked
"Plan with AI" to refine it. Your job:
  1. Acknowledge the initiative by name in your first reply.
  2. Identify which fields are sparse or missing (KPI? business justification? current
     state? baseline labor cost?). Interview the user one or two questions at a time,
     prioritising the highest-impact gaps.
  3. After 3-5 turns of refinement, propose a JSON block with the form-fill values:
       \`\`\`json
       { "improvement_kpi": "...", "business_justification": "...", "current_state": "..." }
       \`\`\`
  4. Tell the user they can copy these into the Hub form (Session 2 will auto-populate).

Do NOT generate workflow JSON in planning mode. Workflow building happens in a
separate session after the initiative is saved.
</initiative_context>`;
  }

  // building mode
  return `<initiative_context mode="building" initiative_id="${prefill.initiative_id}">
${lines}

You are in BUILDING mode. The user clicked "Generate workflow with AI" on this
saved initiative. Your job:
  1. Acknowledge the initiative by name in your first reply.
  2. Restate the requirements you infer from the metadata above in your own words —
     the trigger, data sources, transformations, destinations, and success metric.
  3. Ask only the clarifying questions that are NOT already answered by the metadata.
  4. Proceed with the standard workflow build flow once aligned.

When you emit the workflow JSON, the header sticky note MUST include three extra
lines after the purpose (per the system prompt's <sticky_notes> rule):
    **Initiative:** ${m.title}
    **Generated by:** @{handle} on {YYYY-MM-DD}
    **Hub:** ${m.hub_url}
</initiative_context>`;
}

/**
 * Build a `<promote_context>` block from a Hub-supplied promote payload. Prepended ABOVE
 * the department context on the first turn of a Take-to-Production session. The system
 * prompt's `<promote_to_production>` rule detects this block and runs the production
 * checklist deterministically (no need for the user to type the trigger phrase).
 */
function buildPromoteContext(promote: PromoteContext): string {
  const lines = [
    `workflow_id: ${promote.workflow_id}`,
    promote.workflow_name ? `workflow_name: ${promote.workflow_name}` : null,
    `innovation_item_id: ${promote.innovation_item_id}`,
    `initiative_id: ${promote.initiative_id}`,
    `department_id: ${promote.department_id}`,
    promote.hub_url ? `hub_url: ${promote.hub_url}` : null,
  ].filter(Boolean).join('\n  ');

  return `<promote_context>
  ${lines}
</promote_context>

You are in PROMOTE mode for the workflow above. Run the production checklist per the system
prompt's <promote_to_production> rule. Do not engage with off-topic requests — if the user
asks for anything outside promotion (e.g. revising the initiative, redesigning the workflow),
direct them to "Plan with AI" on the parent initiative in the Hub. To inspect the workflow's
current JSON, call the get_workflow_for_promotion tool with the workflow_id above.`;
}

/**
 * Build a `<poc_context>` block from a Hub-supplied PoC payload. Prepended ABOVE
 * the department context on the first turn of a poc-mode session. The system
 * prompt's `<poc_mode>` rule detects this block and skips Phase 1/2 (initiative
 * interview), going straight to Builder mode against the PoC spec.
 *
 * Precedence: when <poc_context> is present, the AI must IGNORE any
 * <initiative_context> for behaviour purposes — PoC scope wins (leaf scope).
 * The optional initiative_id is informational parent context only.
 */
function buildPocContext(poc: PocContext): string {
  const lines = [
    `poc_id: ${poc.poc_id}`,
    `poc_title: ${poc.poc_title}`,
    poc.initiative_id ? `initiative_id: ${poc.initiative_id}` : null,
    poc.idea_id ? `idea_id: ${poc.idea_id}` : null,
    `department_id: ${poc.department_id}`,
    poc.poc_description ? `poc_description: ${poc.poc_description}` : null,
    poc.poc_guidelines_doc ? `poc_guidelines_doc: ${poc.poc_guidelines_doc}` : null,
    poc.hub_url ? `hub_url: ${poc.hub_url}` : null,
  ].filter(Boolean).join('\n  ');

  return `<poc_context>
  ${lines}
</poc_context>

You are in POC mode. Build a workflow that delivers exactly what this PoC describes. Skip the
initiative interview (Phases 1 and 2) — the PoC has already been scoped. Go straight to Builder:
search for nodes, validate them, propose the workflow JSON, then deploy. If poc_guidelines_doc
is set, ask the user to share its contents only if you need detail beyond the description.`;
}

/**
 * Extract a fenced ```json block from the assistant's final reply and
 * whitelist it down to fields the Hub's StrategicIdea form recognises.
 * Returns null when no parseable JSON block is found, when no whitelisted
 * keys survive validation, or when the input is malformed.
 *
 * Defense-in-depth: the Edge Function re-validates these same bounds.
 */
function extractAndValidatePlanningFields(text: string): Record<string, string | number | string[]> | null {
  // Permissive block-finder: accepts ```json, ```JSON, ```json5, ```js, or bare ```
  // followed (optionally) by whitespace/newline. Claude is inconsistent about
  // fence variants under pressure — losing the planning payload because of a
  // case-sensitive `json` was the 2026-05-11 silent-failure root cause.
  const blockRe = /```(?:json\d?|JSON|js)?\s*\r?\n?([\s\S]*?)\r?\n?```/gi;
  const matches = [...text.matchAll(blockRe)];
  if (matches.length === 0) return null;

  // Try each block from LAST to FIRST. The last block is typically the
  // canonical payload (drafts come first); but if it fails to parse, an
  // earlier block may still be valid (e.g. AI re-printed prose-with-JSON
  // after a confirmation prompt).
  let parsed: Record<string, unknown> | null = null;
  for (let i = matches.length - 1; i >= 0; i--) {
    const body = matches[i][1].trim();
    if (!body) continue;
    try {
      const candidate: unknown = JSON.parse(body);
      if (candidate && typeof candidate === 'object' && !Array.isArray(candidate)) {
        parsed = candidate as Record<string, unknown>;
        break;
      }
    } catch { /* try previous block */ }
  }
  if (!parsed) return null;

  const obj = parsed;
  const out: Record<string, string | number | string[]> = {};

  const stringField = (key: string, max: number): void => {
    const v = obj[key];
    if (typeof v === 'string' && v.length > 0 && v.length <= max) out[key] = v;
  };
  const enumField = (key: string, allowed: readonly string[]): void => {
    const v = obj[key];
    if (typeof v === 'string' && allowed.includes(v)) out[key] = v;
  };
  const arrayPatternField = (key: string, pattern: RegExp, maxLen: number): void => {
    const v = obj[key];
    if (!Array.isArray(v)) return;
    const cleaned: string[] = [];
    for (const item of v) {
      if (typeof item !== 'string') continue;
      const trimmed = item.trim().toUpperCase();
      if (pattern.test(trimmed) && !cleaned.includes(trimmed)) cleaned.push(trimmed);
      if (cleaned.length >= maxLen) break;
    }
    if (cleaned.length > 0) out[key] = cleaned;
  };

  // Mirrors the Hub StrategicIdea form. Source of truth for these enums:
  // /Users/alvaro.cuba/Code/AI-Innovation-Hub-Vertex/types.ts (LevelOfImprovement,
  // ImpactCategory, EffortLevel) — Edge Function n8n-conversation-callback
  // re-validates the same lists.
  const DEPARTMENTS = [
    'Marketing',
    'Customer Success',
    'Customer Experience',
    'Onboarding',
    'Payments',
    'Finance',
    'Product',
    'People',
    'Information Systems',
  ] as const;
  const LEVEL_OF_IMPROVEMENT = ['Low', 'Medium', 'High', 'Very High'] as const;
  const IMPACT_CATEGORY = [
    'Time Savings',
    'Improved Quality',
    'Reduced Cost',
    'Increased Revenue',
    'Efficiency',
    'Quality',
    'Business',
  ] as const;
  const EFFORT = ['Low', 'Medium', 'High'] as const;

  stringField('title', 200);
  stringField('description', 2000);
  stringField('improvement_kpi', 500);
  stringField('business_justification', 1000);
  stringField('current_state', 1000);
  enumField('department', DEPARTMENTS);
  stringField('data_sources', 500);
  enumField('level_of_improvement', LEVEL_OF_IMPROVEMENT);
  enumField('impact_category', IMPACT_CATEGORY);
  enumField('effort', EFFORT);
  // 2026-05-13: current_process_minutes_per_run / _runs_per_month /
  // _people_count removed — n8n-ops Time Saved KPI v3 reads
  // settings.timeSavedPerExecution directly from n8n workflow settings;
  // these baseline fields no longer feed anything. Hub UI form inputs
  // removed in the same release. DB columns left intact for historical
  // records.
  arrayPatternField('jira_ticket_ids', /^[A-Z][A-Z0-9_]+-\d+$/, 5);

  return Object.keys(out).length > 0 ? out : null;
}

/**
 * Walk the conversation history backwards looking for the most-recent model
 * message that yields a non-null planning payload. Used as a fallback when
 * the AI emits <create_initiative /> without re-attaching the JSON in the
 * same turn (which it does often once the form has been confirmed verbally).
 */
function extractFromHistory(history: DisplayMessage[]): Record<string, string | number | string[]> | null {
  for (let i = history.length - 1; i >= 0; i--) {
    const msg = history[i];
    if (msg.role !== 'model') continue;
    const extracted = extractAndValidatePlanningFields(msg.content);
    if (extracted) return extracted;
  }
  return null;
}

export async function POST(req: Request): Promise<Response> {
  const user = await getUserFromRequest(req);
  if (!user) {
    return new Response('Unauthorized', { status: 401 });
  }

  let body: {
    message?: string;
    conversationId?: string;
    departmentId?: string;
    mode?: AssistantMode;
    file?: { name: string; content: string; encoding: 'text' | 'base64'; mediaType: string };
    prefill?: InitiativePrefill;
    // Direction-3: client signals embed mode in the body because middleware-set
    // request headers (x-embed) only fire on the /chat/* page route and don't
    // propagate to /api/chat XHRs.
    embed?: boolean;
    // Direction-3 Phase 3 handoff: when the Hub auto-saves a draft initiative
    // mid-conversation, the client passes the new real UUID here. Server swaps
    // the conversation's stored initiativeId from `__draft__` to this value
    // and prepends a fresh <initiative_context> block so the AI continues
    // with the right id for the workflow build phase.
    current_initiative_id?: string;
    // Take-to-Production flow: Hub passes this on the first turn of a promote-mode
    // conversation. Server injects a <promote_context> block above the department
    // context so the system prompt's <promote_to_production> rule fires
    // deterministically. Persisted as part of the first user message in history.
    promote_context?: PromoteContext;
    // PoC flow (Session 10): Hub passes this on the first turn of a poc-mode
    // conversation. Server injects a <poc_context> block above the department
    // context so the system prompt's <poc_mode> rule fires deterministically and
    // skips the Phase 1/2 initiative interview.
    poc_context?: PocContext;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return new Response('Invalid JSON', { status: 400 });
  }

  const { message, conversationId: existingConvId, file, prefill, embed, current_initiative_id, promote_context, poc_context } = body;
  if (!message?.trim()) {
    return new Response('message is required', { status: 400 });
  }

  // Resolve department and mode
  let departmentId = body.departmentId ?? DEFAULT_DEPARTMENT;
  let mode: AssistantMode = body.mode ?? 'builder';

  // Load or create the conversation
  let conversationId = existingConvId;
  let history: DisplayMessage[] = [];
  // Initiative state — derived from prefill on first turn, from conv on later turns.
  // Used at end-of-stream to fire the planning-mode JSON extraction callback.
  let initiativeId: string | undefined = prefill?.initiative_id;
  let initiativeMode: 'planning' | 'building' | undefined = prefill?.mode;
  // Direction-3 source: set once at conversation creation, then read back on
  // subsequent turns. Stale subsequent-turn requests cannot promote a standalone
  // conversation into a Hub-write context.
  let conversationSource: 'standalone' | 'hub_prefill' | 'hub_embed' | undefined;

  if (conversationId) {
    const conv = await getConversation(user.email, conversationId);
    if (conv) {
      history = conv.messages;
      // Use the conversation's stored department and mode (not the request's)
      if (conv.departmentId) {
        departmentId = conv.departmentId;
      }
      if (conv.mode) {
        mode = conv.mode;
      }
      if (conv.initiativeId) {
        initiativeId = conv.initiativeId;
      }
      if (conv.initiativeMode) {
        initiativeMode = conv.initiativeMode;
      }
      conversationSource = conv.source;
    } else {
      conversationId = undefined;
    }
  }

  // If a Hub-supplied prefill scopes the conversation to an initiative AND its
  // department maps to a known chat-ui dept id, lock the conversation to that dept
  // before persisting (so the conversation doc records the right value).
  const prefillDeptId = prefill?.initiative_metadata?.department_id;
  if (!existingConvId && prefillDeptId) {
    const mapped = getDepartment(prefillDeptId);
    if (mapped) {
      departmentId = prefillDeptId;
    }
  }

  // Same lock for promote-mode: scope the conversation to the dept on the PROJ.
  if (!existingConvId && promote_context?.department_id) {
    const mapped = getDepartment(promote_context.department_id);
    if (mapped) {
      departmentId = promote_context.department_id;
    }
  }

  // Same lock for poc-mode (Session 10): scope the conversation to the PoC's
  // department. PoC scope wins over prefill/promote if multiple arrive.
  if (!existingConvId && poc_context?.department_id) {
    const mapped = getDepartment(poc_context.department_id);
    if (mapped) {
      departmentId = poc_context.department_id;
    }
  }

  // Direction-3: derive the conversation source. Set once at creation, never
  // mutated. Hub-write paths (n8n-conversation-callback) defensively reject
  // 'standalone' so a misuse can't reach Hub data. On subsequent turns, the
  // source is the one stored on the conversation doc — NOT re-derived from
  // the request, so a standalone conv can never be promoted by a stale prefill.
  const source: 'standalone' | 'hub_prefill' | 'hub_embed' =
    conversationSource ??
    (poc_context || promote_context ? 'hub_embed' : !prefill ? 'standalone' : embed ? 'hub_embed' : 'hub_prefill');

  if (!conversationId) {
    // PoC-mode: persist the parent initiative_id (if present) onto the
    // conversation so subsequent turns + deploy callback can use it. For
    // Idea-path PoCs (no parent initiative), initiativeId stays undefined and
    // the deploy callback fires with innovation_item_id only.
    const initialInitiativeId = prefill?.initiative_id ?? poc_context?.initiative_id;
    const initialInitiativeMode = prefill?.mode ?? (poc_context ? 'building' : undefined);
    conversationId = await createConversation(
      user.email,
      message,
      departmentId,
      mode,
      initialInitiativeId,
      initialInitiativeMode,
      source,
      poc_context?.poc_id,
    );
  }

  const convId = conversationId; // narrowed — always defined from here on

  // Direction-3 Phase 3 handoff: client supplies the real initiative_id once
  // the Hub has auto-saved the draft. Swap it on the conversation doc and
  // prepend a fresh <initiative_context> note so the AI continues with the
  // right id when it transitions to workflow building. Idempotent — only
  // updates when the value actually changed.
  let handoffNote = '';
  if (
    existingConvId &&
    current_initiative_id &&
    current_initiative_id !== '__draft__' &&
    current_initiative_id !== initiativeId
  ) {
    await updateConversationInitiativeId(user.email, existingConvId, current_initiative_id);
    initiativeId = current_initiative_id;
    handoffNote =
      `<initiative_context_update>\n` +
      `The Hub auto-saved this initiative as a draft. The real initiative_id is now ${current_initiative_id}.\n` +
      `Use this id for any workflow build / deploy in this conversation; the deploy callback will link the workflow to this initiative.\n` +
      `</initiative_context_update>\n\n`;
  }

  // Build department context prefix for the first message of new conversations
  const dept = getDepartment(departmentId);
  let enrichedMessage = message;
  if (!existingConvId && dept) {
    const contextPrefix = buildDepartmentContext(dept, mode);
    // Initiative context goes ABOVE department context — initiative is the higher-level frame.
    const initiativePrefix = prefill ? `${buildInitiativeContext(prefill)}\n\n` : '';
    // Promote context (Take-to-Production flow) goes ABOVE both — promotion scopes the
    // entire conversation. Mutually exclusive with prefill in practice (Hub launches one
    // OR the other), but we don't enforce that here.
    const promotePrefix = promote_context ? `${buildPromoteContext(promote_context)}\n\n` : '';
    // PoC context (Session 10) goes ABOVE everything — PoC is leaf scope. When
    // present, the system prompt's <poc_mode> rule instructs the AI to ignore
    // any <initiative_context> for behaviour purposes.
    const pocPrefix = poc_context ? `${buildPocContext(poc_context)}\n\n` : '';
    enrichedMessage = `${pocPrefix}${promotePrefix}${initiativePrefix}${contextPrefix}\n\n${message}`;
  } else if (handoffNote) {
    enrichedMessage = `${handoffNote}${message}`;
  }

  // Fire-and-forget: tell the Hub a conversation has started against this
  // initiative so it shows up in the IdeaDetailModal "AI Sessions" panel.
  if (!existingConvId && prefill && process.env.HUB_CALLBACK_URL && process.env.HUB_CALLBACK_SECRET) {
    fetch(`${process.env.HUB_CALLBACK_URL}/n8n-conversation-callback`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Hub-Secret': process.env.HUB_CALLBACK_SECRET,
      },
      body: JSON.stringify({
        initiative_id: prefill.initiative_id,
        conversation_id: convId,
        mode: prefill.mode === 'planning' ? 'planning' : 'building',
        created_by: user.email,
        source,
      }),
      signal: AbortSignal.timeout(5000),
    }).catch((err) => console.error('Hub conversation-callback failed:', err));
  }

  // Fetch n8n-mcp tools (cached)
  let rawTools: RawMcpTool[] = [];
  try {
    rawTools = await getRawMcpTools();
  } catch (err) {
    console.error('Failed to load MCP tools:', err);
  }

  // Apply context windowing for long conversations (>16 messages AND >80K tokens)
  const { messages: managedHistory, windowed } = await manageContext(history, mode);
  if (windowed) {
    console.log(`Context windowed: ${history.length} → ${managedHistory.length} messages`);
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
      const eventStream = streamWorkflowChat(managedHistory, enrichedMessage, rawTools, departmentId, file, mode);

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
              ...(event.toolSummary ? { toolContext: event.toolSummary } : {}),
            };

            try {
              const { messageLimitReached } = await appendMessages(user.email, convId, [userMsg, modelMsg]);
              if (messageLimitReached) {
                enqueue({ type: 'text_chunk', text: '\n\n> **Note:** This conversation has reached the 100-message limit. Older messages have been trimmed. Consider starting a new conversation for best results.' });
              }
            } catch (err) {
              console.error('Failed to persist messages:', err);
            }

            // Planning-mode end-of-turn handling. Three concerns, each
            // independently gated to avoid the 2026-05-11 silent-failure bug
            // where a missing JSON block in the current turn killed the
            // sentinel-driven write path:
            //
            //   (a) Extract planning fields if the AI emitted JSON this turn.
            //       Drives the Hub's form-fill (`extracted_fields` SSE) and the
            //       initiative_chat_conversations summary row.
            //
            //   (b) Sentinel-driven server-write: when <create_initiative /> or
            //       <update_initiative /> appears, call the Hub Edge Function.
            //       Falls back to history-extracted fields when the current
            //       turn omitted the JSON (common after the user already
            //       confirmed verbally in an earlier reply).
            //
            //   (c) Legacy <request_workflow_handoff /> postMessage — only
            //       emitted when the new server-write sentinels did NOT fire,
            //       to avoid two races writing the same row.
            //
            // Always log one structured `planning_turn` line at the end so we
            // can see what happened from Cloud Run logs without storing PII.
            if (initiativeMode === 'planning' && initiativeId) {
              const fullReply = modelChunks.join('');
              const wantsCreate = /<create_initiative\s*\/?>/i.test(fullReply);
              const wantsUpdate = /<update_initiative\s*\/?>/i.test(fullReply);
              const wantsLegacyHandoff = /<request_workflow_handoff\s*\/?>/i.test(fullReply);

              // (a) Current-turn extraction
              const extractedThisTurn = extractAndValidatePlanningFields(fullReply);
              if (extractedThisTurn) {
                const extractedAt = new Date().toISOString();
                enqueue({
                  type: 'extracted_fields',
                  initiative_id: initiativeId,
                  conversation_id: convId,
                  extracted_fields: extractedThisTurn,
                  extracted_fields_at: extractedAt,
                });
                if (process.env.HUB_CALLBACK_URL && process.env.HUB_CALLBACK_SECRET) {
                  fetch(`${process.env.HUB_CALLBACK_URL}/n8n-conversation-callback`, {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                      'X-Hub-Secret': process.env.HUB_CALLBACK_SECRET,
                    },
                    body: JSON.stringify({
                      initiative_id: initiativeId,
                      conversation_id: convId,
                      mode: 'planning',
                      created_by: user.email,
                      extracted_fields: extractedThisTurn,
                      source,
                    }),
                    signal: AbortSignal.timeout(5000),
                  }).catch((err) => console.error('Hub extracted-fields callback failed:', err));
                }
              }

              // (b) Sentinel-driven server-write
              let upsertResult: Awaited<ReturnType<typeof callHubInitiativeUpsert>> | null = null;
              let extractedFromHistory = false;
              let fieldsForUpsert: Record<string, string | number | string[]> | null = extractedThisTurn;
              if (wantsCreate || wantsUpdate) {
                if (!fieldsForUpsert) {
                  fieldsForUpsert = extractFromHistory(history);
                  extractedFromHistory = !!fieldsForUpsert;
                }
                if (!fieldsForUpsert) {
                  enqueue({
                    type: 'initiative_upsert_failed',
                    reason: 'AI emitted <create_initiative /> but no valid JSON payload was found in this turn or any prior turn. Ask the AI to re-send the JSON.',
                    mode: wantsCreate ? 'create' : 'update',
                  });
                } else {
                  const isDraft = initiativeId === '__draft__';
                  const upsertMode: 'create' | 'update' = wantsUpdate && !isDraft ? 'update' : 'create';
                  const scalarFields: InitiativeUpsertFields = {};
                  for (const [k, v] of Object.entries(fieldsForUpsert)) {
                    if (Array.isArray(v)) continue;
                    (scalarFields as Record<string, string | number>)[k] = v;
                  }
                  upsertResult = await callHubInitiativeUpsert({
                    mode: upsertMode,
                    conversation_id: convId,
                    initiative_id: upsertMode === 'update' ? initiativeId : undefined,
                    created_by: user.email,
                    fields: scalarFields,
                  });
                  if (upsertResult.ok) {
                    if (upsertMode === 'create' && isDraft && upsertResult.data.initiative_id !== initiativeId) {
                      try {
                        await updateConversationInitiativeId(user.email, convId, upsertResult.data.initiative_id);
                        initiativeId = upsertResult.data.initiative_id;
                      } catch (err) {
                        console.error('Failed to swap initiativeId after upsert:', err);
                      }
                    }
                    enqueue({
                      type: 'initiative_upserted',
                      initiative_id: upsertResult.data.initiative_id,
                      url: upsertResult.data.url,
                      action: upsertResult.data.action,
                      updated_fields: upsertResult.data.updated_fields,
                    });
                  } else {
                    console.error('Initiative upsert failed:', upsertResult.reason);
                    enqueue({
                      type: 'initiative_upsert_failed',
                      reason: upsertResult.reason,
                      mode: upsertMode,
                    });
                  }
                }
              }

              // (c) Legacy handoff — only when the new path didn't run.
              // Prevents the AddStrategicIdeaModal autosave path from racing
              // the Edge Function create on the same turn.
              if (wantsLegacyHandoff && !wantsCreate && !wantsUpdate) {
                enqueue({
                  type: 'request_workflow_handoff',
                  initiative_id: initiativeId,
                  conversation_id: convId,
                });
              }

              // (d) Observability — one structured line per planning turn.
              // Greppable via `textPayload=~"planning_turn"` in Cloud Run logs.
              // No PII: no chat content, no user email.
              console.log(JSON.stringify({
                event: 'planning_turn',
                convId,
                hasSentinelCreate: wantsCreate,
                hasSentinelUpdate: wantsUpdate,
                hasLegacyHandoff: wantsLegacyHandoff,
                extractedCurrentTurn: !!extractedThisTurn,
                extractedFromHistory,
                upsertCalled: (wantsCreate || wantsUpdate) && !!fieldsForUpsert,
                upsertOk: upsertResult?.ok ?? null,
                upsertAction: upsertResult?.ok ? upsertResult.data.action : null,
                upsertReason: upsertResult && !upsertResult.ok ? upsertResult.reason : null,
              }));
            }

            // Log analytics event with token usage (fire-and-forget)
            const usage = event.usage;
            const analyticsEvent: AnalyticsEvent = {
              userEmail: user.email,
              departmentId,
              mode,
              conversationId: convId,
              turnNumber: Math.floor(history.length / 2) + 1,
              sessionStartedAt: new Date(startTime).toISOString(),
              latencyMs: Date.now() - startTime,
              toolCallCount: toolCallNames.length,
              toolCallNames,
              skillsLoaded: toolCallNames.filter(n => n === 'get_n8n_skill'),
              specsLoaded: toolCallNames.filter(n => n === 'get_company_spec'),
              inputTokens: usage?.inputTokens,
              outputTokens: usage?.outputTokens,
              cacheReadTokens: usage?.cacheReadTokens,
              cacheWriteTokens: usage?.cacheWriteTokens,
              truncated: event.truncated,
              contextWindowed: windowed,
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
