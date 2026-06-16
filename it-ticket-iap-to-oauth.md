# IT Ticket — Replace IAP with app-level Google OAuth on `n8n-chat-ui`

**Submit this in parallel with Session 1 work — Session 3 of the Hub × n8n-builder integration is gated on this.**

---

## Title
Replace IAP with app-level Google OAuth on Cloud Run service `n8n-chat-ui`

## Service details
- **Project:** `agentic-workflows-485210`
- **Region:** `europe-west1`
- **Service:** `n8n-chat-ui` (currently IAP-protected)
- **Service URL:** `https://n8n-chat-ui-535171325336.europe-west1.run.app`
- **Owner SA:** `n8n-workflow-builder@agentic-workflows-485210.iam.gserviceaccount.com`

## What we want
Move authentication from Cloud IAP (load-balancer-level) to app-level Google OAuth verification inside the chat-ui Next.js app. Same Guesty Google identity gate for users; same allowed-domain restriction (`@guesty.com` + `@rentalsunited.com`); but auth happens inside the app so the service can serve cross-origin requests from other Guesty Google Cloud apps — specifically the AI Innovation Hub at `ai-innovation-hub.run.app`, project `ai-innovation-484111`, region `us-central1`.

## Why we need this
We are building bidirectional integration between the Hub and the n8n-builder. End-state UX is an embedded chat panel inside the Hub, which requires CORS-enabled API calls from the Hub origin. IAP at the LB layer enforces same-origin redirects, which blocks any embed.

## What changes

1. **Code change in `n8n-chat-ui`** to verify Google ID tokens server-side using the existing `@guesty.com` / `@rentalsunited.com` domain restriction logic (already implemented for IAP — we move the gate up the stack).
2. **Cloud Run config:**
   - Remove `--ingress=internal-and-cloud-load-balancing` restriction
   - Remove IAP from the LB
   - Allow `--allow-unauthenticated` at the Cloud Run level (auth is now in app code)
3. **Environment variables:**
   - Add `ALLOWED_OAUTH_DOMAINS=guesty.com,rentalsunited.com`
   - Add `GOOGLE_OAUTH_CLIENT_ID` — needs an OAuth client created in project `agentic-workflows-485210`
4. **CORS allowlist** for the Hub origin in chat-ui middleware: `https://ai-innovation-hub-hoepmeihvq-uc.a.run.app` and the future `https://thehub.gue5ty.com`.

## Security posture
- Equivalent to today's IAP gate, but at the app layer instead of the LB layer.
- Same domain restriction (Guesty employees only).
- All API routes require valid Google ID token + allowed domain.
- Audit logging unchanged (Cloud Run access logs).
- No new public surface — `--allow-unauthenticated` at Cloud Run is a misnomer here; the app rejects anything without a valid token.

## Permissions needed (request)
- `roles/run.admin` on `n8n-chat-ui` service (to remove IAP, update env)
- `roles/iam.serviceAccountUser` on the OAuth client (to mint client)
- **OR:** action-by-IT to apply the changes, with code change reviewed by the requester (Alvaro Cuba).

## Deployment plan
- **Estimated downtime:** zero. The new auth path can be deployed alongside the IAP path on a separate revision; cutover is a Cloud Run traffic split.
- **Rollback:** re-enable IAP on the LB; revert the Cloud Run revision.

## Timeline
**ASAP** — gating Session 3 of an active product integration with the AI Innovation Hub. Ideally landed within 1-2 weeks.

## Contact
alvaro.cuba@guesty.com
