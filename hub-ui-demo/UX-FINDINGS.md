# Hub UI — UX/UI Revision (live walkthrough, 2026-05-03)

End-to-end Playwright walkthrough of the 4 PRs we shipped (#12 schema, #13 picker, #14 health card, #15 admin). Tested against `https://ai-innovation-hub-hoepmeihvq-uc.a.run.app` revision `ai-innovation-hub-00073-cr9`.

## Pipeline status

| PR | Code shipped | Visible to users | Functional |
|---|:-:|:-:|:-:|
| #12 schema | ✅ | n/a (data layer) | ✅ tables exist, RLS enforced |
| #13 link picker | ✅ | ✅ renders in edit modal | ⚠️ blocked on env-var bug (fixed in #16) |
| #14 health card | ✅ | ✅ renders in detail modal | ✅ empty state copy correct |
| #15 admin page | ✅ | ✅ renders at `/admin/n8n-link-suggestions` | ⚠️ blocked on same env-var bug (fixed in #16) |

## Issues found, by severity

### 🔴 P0 — sign-in is broken at the custom domain (pre-existing, not ours)

**File**: [`hub-01-login.png`](./hub-01-login.png)

When a user signs in via Google at `https://thehub.gue5ty.com/`, the OAuth round-trip succeeds (Supabase issues a valid JWT), but the redirect target itself returns **HTTP 403 from CloudFront** (`x-cache: Error from cloudfront`). Every Guesty user re-authenticating today gets stuck.

- **Cause**: DNS for `thehub.gue5ty.com` points at AWS CloudFront IPs (18.67.x.x). CloudFront is misconfigured / can't reach origin / has WAF blocking. Cloud Run domain-mapping is healthy and serves 200 OK when the host header reaches it directly (verified via `--resolve` bypass).
- **Not introduced by our merges**: none of PRs #12/#13/#14/#15/#16 touched `services/supabase.ts`, `Login.tsx`, OAuth handlers, env vars, or DNS. This bug was latent — only surfaces on re-auth, so users with cached Supabase sessions never noticed.
- **Workaround in production right now**: bookmark `https://ai-innovation-hub-hoepmeihvq-uc.a.run.app/` and sign in there. Cloud Run is healthy and serves the latest code.
- **Real fix (needs DNS/AWS access from Guesty IT)**: change the CNAME for `thehub.gue5ty.com` from CloudFront to `ghs.googlehosted.com` (Cloud Run's domain-mapping target). Or fix CloudFront origin/cert/WAF.

### 🟠 P1 — `VITE_N8N_OPS_URL` not in Cloud Build pipeline (introduced + fixed today)

**Files**: [`07-edit-modal-picker-with-error.png`](./07-edit-modal-picker-with-error.png), [`08-admin-suggestions-page.png`](./08-admin-suggestions-page.png)

Both the workflow link picker and the admin suggestion page show `Failed to load workflows: VITE_N8N_OPS_URL is not configured`. Root cause: PR #13 added the env var to `.env.example` but didn't update `Dockerfile`/`cloudbuild.yaml` — so the var stays `undefined` after Vite's compile-time substitution.

- **Status**: PR #16 merged + approved + currently rebuilding. After redeploy, the picker will autocomplete from the public `/workflows` endpoint (847 workflows ready).

### 🟡 P2 — UX nits worth filing

1. **Detail modal scrolls feel disconnected** — the modal has its own internal scroll separate from the page. With 9 sibling sections (Identity → Department → Impact & KPI → Workflow Health → Effort → Business → Ownership → Links → Linked Projects), the user has to scroll a lot. Consider collapsible sections or a TOC sidebar.
2. **No "added today" / unread cue on Workflow Health** — when stats start landing, users won't know whether the empty state means "no data yet" or "stats haven't synced". Add a `synced X minutes ago` line in the header next to "last 7 days".
3. **Edit modal picker error styling** — error message uses small coral text below the input. Easy to miss. Consider replacing the search input with an explicit error block when the env var is missing.
4. **Admin page threshold uses comma** — `"0,6"` displayed instead of `"0.6"` (locale formatting). Confirm before relying on this in copy/docs.
5. **Healthy modal state lacks a CTA** — when "No n8n workflows linked yet" is shown, the helper text says "Open the edit modal to link one" but doesn't provide a direct button. One click to open the edit modal would shorten the loop.
6. **Nothing distinguishes Strategic Initiatives from regular Innovations in the picker target** — the picker is wired in via `AddStrategicIdeaModal` only. If/when innovations grow workflow links, the same component should be reused.

## Verified working

- ✅ Sign-in via Cloud Run URL workaround
- ✅ Innovation Pipeline list, Roadmap Initiatives tab, filters
- ✅ Detail modal opens, sections render correctly
- ✅ **Workflow Health card renders** in detail modal with correct empty state, teal styling, "last 7 days" subtitle
- ✅ Edit modal opens
- ✅ **n8n Workflows picker UI renders** (label, helper text, search input, empty state) — only the API call fails
- ✅ **`/admin/n8n-link-suggestions` route renders** with correct gating (page loads — implies role check passed for `alvaro.cuba`)
- ✅ Code splitting / bundle size unchanged
- ✅ Schema enforces RLS as designed (no orphan rows visible to non-admins)

## Pre-existing things to flag (independent of this work)

- App version banner says **"v1.0"** — not an actual version reference; could mislead. Consider tying to git short-sha or commit date.
- Beta banner mentions "first release" — that copy is stale if the app has been live since January 2026 per git history.
- `console.error` on startup: `Failed to load resource: 403 (favicon.ico)` — minor cosmetic 404 from CloudFront on the broken domain side.
