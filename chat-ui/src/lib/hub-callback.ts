/**
 * Server-side helper for the redesign-v2 server-write path
 * (docs/innovation-hub/redesign-v2-server-write.md).
 *
 * The chat-ui owns the write: when the assistant emits `<create_initiative />`
 * or `<update_initiative />` alongside the planning JSON, we POST the validated
 * fields to the Hub Edge Function `n8n-initiative-upsert`, which inserts /
 * updates the `strategic_ideas` row using a service-role key and returns the
 * new (or existing) id + a deep link.
 *
 * Auth: shared secret in `X-Hub-Secret` (same convention as the existing
 * n8n-conversation-callback / n8n-builder-callback Edge Functions).
 */

export interface InitiativeUpsertFields {
  title?: string;
  description?: string;
  improvement_kpi?: string;
  business_justification?: string;
  current_state?: string;
  department?: string;
  data_sources?: string;
  level_of_improvement?: 'Low' | 'Medium' | 'High' | 'Very High';
  impact_category?:
    | 'Time Savings'
    | 'Improved Quality'
    | 'Reduced Cost'
    | 'Increased Revenue'
    | 'Efficiency'
    | 'Quality'
    | 'Business';
  effort?: 'Low' | 'Medium' | 'High';
  current_process_minutes_per_run?: number;
  current_process_runs_per_month?: number;
  current_process_people_count?: number;
}

export interface InitiativeUpsertRequest {
  mode: 'create' | 'update';
  conversation_id: string;
  initiative_id?: string;          // required when mode='update'
  created_by: string;              // user email
  fields: InitiativeUpsertFields;
}

export interface InitiativeUpsertSuccess {
  initiative_id: string;
  url: string;                     // typically '/#/item/<uuid>' (relative)
  action: 'created' | 'updated' | 'no_changes';
  updated_fields?: string[];
}

export type InitiativeUpsertResult =
  | { ok: true; data: InitiativeUpsertSuccess }
  | { ok: false; reason: string };

/**
 * Public Hub origin used to absolutise the URL the Edge Function returns.
 * Falls back to the production thehub.gue5ty.com host. Server-side env, so
 * NEXT_PUBLIC_* prefix is not strictly required, but we accept it to keep
 * parity with the iframe parent-origin allowlist.
 */
function hubPublicOrigin(): string {
  return (
    process.env.HUB_PUBLIC_ORIGIN ??
    process.env.NEXT_PUBLIC_HUB_PARENT_ORIGIN ??
    'https://thehub.gue5ty.com'
  );
}

function absolutiseUrl(maybeRelative: string): string {
  if (/^https?:\/\//i.test(maybeRelative)) return maybeRelative;
  const origin = hubPublicOrigin().replace(/\/+$/, '');
  const path = maybeRelative.startsWith('/') ? maybeRelative : `/${maybeRelative}`;
  return `${origin}${path}`;
}

/**
 * POST to the Hub's n8n-initiative-upsert Edge Function. Returns a discriminated
 * union so callers can branch without try/catch. Network/timeout failures are
 * swallowed into `ok: false` with a human-readable reason.
 */
export async function callHubInitiativeUpsert(
  payload: InitiativeUpsertRequest,
): Promise<InitiativeUpsertResult> {
  const base = process.env.HUB_CALLBACK_URL;
  const secret = process.env.HUB_CALLBACK_SECRET;
  if (!base || !secret) {
    return { ok: false, reason: 'Hub callback not configured (HUB_CALLBACK_URL / HUB_CALLBACK_SECRET missing).' };
  }

  let res: Response;
  try {
    res = await fetch(`${base.replace(/\/+$/, '')}/n8n-initiative-upsert`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Hub-Secret': secret,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10_000),
    });
  } catch (err) {
    return { ok: false, reason: `Network error: ${String(err)}` };
  }

  if (!res.ok) {
    let body = '';
    try {
      body = await res.text();
    } catch {
      /* ignore */
    }
    return { ok: false, reason: `Hub returned ${res.status}${body ? `: ${body.slice(0, 200)}` : ''}` };
  }

  let parsed: unknown;
  try {
    parsed = await res.json();
  } catch (err) {
    return { ok: false, reason: `Invalid JSON from Hub: ${String(err)}` };
  }

  const data = parsed as Partial<InitiativeUpsertSuccess>;
  if (!data?.initiative_id || !data?.url || !data?.action) {
    return { ok: false, reason: 'Hub response missing required fields (initiative_id / url / action).' };
  }

  return {
    ok: true,
    data: {
      initiative_id: data.initiative_id,
      url: absolutiseUrl(data.url),
      action: data.action,
      updated_fields: data.updated_fields,
    },
  };
}
