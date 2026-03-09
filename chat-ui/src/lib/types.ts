// ─── Event types streamed to the client ──────────────────────────────────────

export type ChatEvent =
  | { type: 'tool_call'; name: string; args: Record<string, unknown> }
  | { type: 'text_chunk'; text: string }
  | { type: 'done' }
  | { type: 'error'; message: string };

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
