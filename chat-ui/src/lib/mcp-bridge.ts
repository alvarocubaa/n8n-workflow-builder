const MCP_URL = `${process.env.MCP_SERVICE_URL ?? 'http://localhost:3001'}/mcp`;
const MCP_AUTH = process.env.MCP_AUTH_TOKEN ?? '';

// Detect Cloud Run: K_SERVICE is set in all Cloud Run environments.
const IS_CLOUD_RUN = Boolean(process.env.K_SERVICE);

let requestId = 0;
function nextId(): number { return ++requestId; }

// ─── Google identity token (Cloud Run SA-to-SA auth) ─────────────────────────
// In Cloud Run, n8n-mcp requires an identity token in Authorization to satisfy
// the Cloud Run IAM run.invoker check. The MCP AUTH_TOKEN is passed separately
// in X-MCP-Auth so n8n-mcp's own auth check still works.

async function fetchIdentityToken(audience: string): Promise<string> {
  const url = `http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/identity?audience=${encodeURIComponent(audience)}`;
  const res = await fetch(url, { headers: { 'Metadata-Flavor': 'Google' } });
  if (!res.ok) throw new Error(`Failed to fetch identity token: ${res.status}`);
  return res.text();
}

// ─── Session management ───────────────────────────────────────────────────────
// The n8n-mcp HTTP server uses MCP Streamable HTTP transport (single-session).
// After initialize, the server returns a `mcp-session-id` header that must be
// sent on every subsequent request.
//
// Because the MCP server is single-session, all concurrent requests in this
// Cloud Run instance share one session. We use a mutex (initPromise) to prevent
// concurrent initialization races — only the first caller initializes, others
// await the same promise.

let sessionId: string | null = null;
let initPromise: Promise<void> | null = null;

async function mcpCall(method: string, params?: unknown): Promise<unknown> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Accept': 'application/json, text/event-stream',
  };

  if (IS_CLOUD_RUN) {
    const audience = process.env.MCP_SERVICE_URL ?? 'http://localhost:3001';
    const idToken = await fetchIdentityToken(audience);
    headers['Authorization'] = `Bearer ${idToken}`;
    headers['X-MCP-Auth'] = MCP_AUTH;
  } else {
    headers['Authorization'] = `Bearer ${MCP_AUTH}`;
  }

  if (sessionId) headers['mcp-session-id'] = sessionId;

  const res = await fetch(MCP_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify({ jsonrpc: '2.0', method, params, id: nextId() }),
  });

  // Capture session ID returned by the server after initialize
  const newSessionId = res.headers.get('mcp-session-id');
  if (newSessionId) sessionId = newSessionId;

  if (!res.ok) {
    // Session expired — reset so next call re-initializes
    if (res.status === 400 && sessionId) {
      sessionId = null;
      cachedRawTools = null;
      initPromise = null;
    }
    throw new Error(`MCP HTTP error ${res.status}: ${await res.text()}`);
  }

  // The n8n-mcp server returns SSE-formatted responses (event: message / data: {...})
  // when the client sends Accept: application/json, text/event-stream.
  const text = await res.text();
  const dataLine = text.split('\n').find(l => l.startsWith('data: '));
  const jsonText = dataLine ? dataLine.slice(6) : text;
  const json = JSON.parse(jsonText) as { result?: unknown; error?: { message: string } };
  if (json.error) throw new Error(`MCP error: ${json.error.message}`);
  return json.result;
}

async function doInit(): Promise<void> {
  sessionId = null;
  await mcpCall('initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'n8n-chat-ui', version: '1.0.0' },
  });
  const result = (await mcpCall('tools/list')) as { tools: RawMcpTool[] };
  cachedRawTools = (result.tools ?? []).filter(t => ALLOWED_TOOLS.has(t.name));
}

// ─── Raw MCP tool type ──────────────────────────────────────────────────────

export type RawMcpTool = {
  name: string;
  description?: string;
  inputSchema?: {
    type?: string | string[];
    description?: string;
    properties?: Record<string, unknown>;
    items?: unknown;
    required?: string[];
    enum?: unknown[];
    anyOf?: unknown[];
    oneOf?: unknown[];
  };
};

// ─── Tool allowlist ───────────────────────────────────────────────────────────
const ALLOWED_TOOLS = new Set([
  'tools_documentation',
  'search_nodes',
  'get_node',
  'validate_node',
  'validate_workflow',
  'get_template',
  'search_templates',
  'n8n_get_workflow',
  'n8n_list_workflows',
  'n8n_health_check',
]);

// ─── Public API ───────────────────────────────────────────────────────────────

let cachedRawTools: RawMcpTool[] | null = null;

/** Returns raw MCP tools. Concurrent callers share one init to avoid races. */
export async function getRawMcpTools(): Promise<RawMcpTool[]> {
  if (cachedRawTools) return cachedRawTools;

  // Mutex: only the first caller triggers init; concurrent callers await the same promise
  if (!initPromise) {
    initPromise = doInit().catch(err => {
      // Reset on failure so the next call retries
      initPromise = null;
      cachedRawTools = null;
      throw err;
    });
  }
  await initPromise;
  return cachedRawTools!;
}

export async function callMcpTool(
  name: string,
  args: Record<string, unknown>
): Promise<string> {
  // Re-initialize if the session was reset (e.g. server restart or expiry)
  if (!sessionId) await getRawMcpTools();

  const result = (await mcpCall('tools/call', {
    name,
    arguments: args,
  })) as { content?: Array<{ type: string; text?: string }> };

  const content = result?.content ?? [];
  const text = content
    .filter(c => c.type === 'text' && c.text)
    .map(c => c.text!)
    .join('\n');

  return text || JSON.stringify(result);
}
