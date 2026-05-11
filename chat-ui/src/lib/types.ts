// ─── Assistant modes ─────────────────────────────────────────────────────────

export type AssistantMode = 'builder' | 'data';

// ─── Initiative prefill (Hub × n8n-builder integration) ─────────────────────
// Hub deep-links into chat-ui with a base64-encoded payload of this shape so
// the conversation opens framed around the originating strategic_ideas row.

export type ChatPrefillMode = 'building' | 'planning';

// ─── Promote context (Hub Take-to-Production flow) ───────────────────────────
// Hub deep-links into chat-ui with a base64-encoded PromoteContext when the user
// clicks the "Take to Production" button on a PROJ modal. The conversation opens
// scoped to that single workflow + linked initiative; the system prompt detects
// the context block and runs the production checklist deterministically.

export interface PromoteContext {
  workflow_id: string;          // n8n_workflow_id from initiative_workflow_links
  workflow_name?: string;       // denormalized snapshot from the same row
  innovation_item_id: string;   // PROJ uuid (innovation_items.id)
  initiative_id: string;        // INIT uuid (strategic_ideas.id, parent of PROJ)
  department_id: string;        // chat-ui canonical id (e.g. 'cs', 'cx')
  hub_url?: string;             // deep-link back to the PROJ detail modal
}

export interface InitiativePrefill {
  initiative_id: string;
  mode: ChatPrefillMode;
  initiative_metadata: {
    title: string;
    improvement_kpi?: string;
    business_justification?: string;
    department?: string;
    department_id?: string;       // chat-ui canonical id (e.g. 'cs', 'cx')
    current_state?: string;
    data_sources?: string;
    hub_url: string;              // deep-link back to the initiative detail
  };
  // Planning mode carries the user's draft so the AI knows which fields are
  // already filled and which to interview about.
  initiative_draft?: Record<string, unknown>;
}

// ─── Event types streamed to the client ──────────────────────────────────────

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

export type ChatEvent =
  | { type: 'tool_call'; name: string; args: Record<string, unknown> }
  | { type: 'text_chunk'; text: string }
  | { type: 'done'; usage?: TokenUsage; truncated?: boolean; toolSummary?: string }
  | { type: 'error'; message: string }
  // Embed-mode (Direction 3): server emits this after a planning-mode turn whose
  // final reply parses cleanly. Client relays via postMessage to the Hub parent.
  | {
      type: 'extracted_fields';
      initiative_id: string;
      conversation_id: string;
      extracted_fields: Record<string, string | number | string[]>;
      extracted_fields_at: string;
    }
  // Embed-mode (Direction 3, Phase 3 handoff): server emits this when the
  // assistant's planning-mode reply contains the <request_workflow_handoff />
  // sentinel. Client relays via postMessage so the Hub auto-saves the open
  // form as a draft initiative; the new id is sent back via `initiative_saved`
  // postMessage and used on the next /api/chat turn.
  | {
      type: 'request_workflow_handoff';
      initiative_id: string;
      conversation_id: string;
    }
  // Redesign-v2 server-write path: when the assistant emits the literal
  // sentinel `<create_initiative />` or `<update_initiative />` alongside the
  // 13-key JSON, the chat-ui server calls the Hub's n8n-initiative-upsert
  // Edge Function directly. On success it emits this event; the client renders
  // an inline "Open in Hub →" link and caches the id for downstream workflow
  // builds in the same conversation.
  | {
      type: 'initiative_upserted';
      initiative_id: string;
      url: string;                     // absolute URL into the Hub
      action: 'created' | 'updated' | 'no_changes';
      updated_fields?: string[];
    }
  | {
      type: 'initiative_upsert_failed';
      reason: string;
      mode: 'create' | 'update';
    };

// ─── Analytics types ────────────────────────────────────────────────────────

export interface AnalyticsEvent {
  userEmail: string;
  departmentId: string;
  conversationId: string;
  turnNumber: number;
  sessionStartedAt: string;   // ISO 8601
  latencyMs: number;
  toolCallCount: number;
  toolCallNames: string[];
  skillsLoaded: string[];     // get_n8n_skill calls
  specsLoaded: string[];      // get_company_spec calls
  seeded?: boolean;           // true for historically seeded records
  inputTokens?: number;       // total input tokens (incl. cache)
  outputTokens?: number;      // total output tokens
  cacheReadTokens?: number;   // tokens read from prompt cache
  cacheWriteTokens?: number;  // tokens written to prompt cache
  truncated?: boolean;        // true if any API call hit max_tokens
  contextWindowed?: boolean;  // true if conversation history was trimmed for context limits
  mode?: AssistantMode;       // 'builder' | 'data'
  createdAt: string;          // ISO 8601
}

export interface DeployEvent {
  userEmail: string;
  departmentId: string;
  conversationId: string;
  workflowId: string;
  workflowUrl: string;
  workflowName: string;
  nodeCount: number;
  nodeTypes: string[];
  hasSqlQuery: boolean;
  complexityScore: number;    // 1–5
  estimatedHoursSaved: number;
  estimatedValueUsd: number;  // hoursSaved * 25
  createdAt: string;          // ISO 8601
}

export interface FeedbackEntry {
  userEmail: string;
  conversationId: string;
  messageIndex: number;
  rating: 'up' | 'down';
  comment: string | null;
  createdAt: string;          // ISO 8601
}
