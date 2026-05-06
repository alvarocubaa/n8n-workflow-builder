# Next session brief — redesign-v2 (server-write architecture)

**Last touched:** 2026-05-06 EOD. Chunks A–D shipped end-to-end today; the form-fill mechanism they built is now scheduled for **deletion** in favour of a server-write architecture. Drafted plan + design docs await execution.

## What you're picking up

The Direction-3 embed (drawer + iframe + auth + popup) is solid and stays. The piece that's being **replaced** is how a Plan-with-AI / Edit-with-AI conversation populates the initiative card.

- **Old (today's mechanism):** AI emits planning JSON → chat-ui parses → SSE event → postMessage to Hub → modal callback → `applyExtractedFields` writes to React state → user clicks Save → Supabase row.
- **New (your job):** AI emits planning JSON + `<create_initiative />` sentinel → chat-ui server validates → POST to a new Hub Edge Function `n8n-initiative-upsert` → service-role write to `strategic_ideas` → SSE response with the new id + URL → ChatWindow renders an inline "Open in Hub" link.

The chat is the single owner of the write. The Hub becomes a read view. No more two-system coordination.

**Why we're doing this:** the form-fill path failed twice in real testing today — once because `mode='building'` skipped the server-side gate, once because no target modal was open. Each bug had a code fix, but the architecture itself was the source of the fragility.

## Read these in order before coding

1. **[`docs/innovation-hub/redesign-v2-server-write.md`](../docs/innovation-hub/redesign-v2-server-write.md)** — the technical design. New flow, new sentinel, Edge Function spec, deletion list (chat-ui + Hub), verification checklist, phased rollout strategy. Your primary brief.
2. **[`docs/innovation-hub/current-architecture.md`](../docs/innovation-hub/current-architecture.md)** — what's deployed now (Chunks A-D). The "Goes (delete)" section in the redesign doc references file paths from this map.
3. **[`docs/innovation-hub/protocol-contract.md`](../docs/innovation-hub/protocol-contract.md)** — wire-level postMessage shapes. Stays valid for `workflow_deployed` + `auth_required` + `auth_token`. The `extracted_fields_updated` half is being deleted.
4. **[`docs/innovation-hub/pop-out-design.md`](../docs/innovation-hub/pop-out-design.md)** — popup contract. Unaffected by redesign-v2.
5. **[`docs/innovation-hub/phase-flow-design.md`](../docs/innovation-hub/phase-flow-design.md)** — **superseded**. Read only for historical context if you want to know why we're here.
6. **[`docs/innovation-hub/promote-design.md`](../docs/innovation-hub/promote-design.md)** — secondary track ("Take to Production" button). **Don't start until redesign-v2 ships** — both touch the system-prompt mode structure. Includes a critical-review pass with 6 load-bearing items.

## Order of operations

1. **Read the redesign-v2 doc fully.** Ask the user any clarifying questions before coding.
2. **Smoke Chunks A–D first** to confirm the embed/auth/popup layers are healthy. The redesign-v2 plan **builds on top of** that infrastructure — don't rewrite it.
3. **Implement redesign-v2** in the phased order from the doc:
   - chat-ui: SSE event types + sentinel detection + Edge Function call helper
   - Hub: `n8n-initiative-upsert` Edge Function (defense-in-depth, idempotent, service-role)
   - chat-ui: system-prompt rewrite of Phase 2 (replace "form auto-fills" with "ask before write" pattern)
   - chat-ui: ChatWindow renders inline "Open in Hub" link from `initiative_upserted` SSE event
4. **Smoke** all 8 verification cases from the redesign doc.
5. **Ship deletion PR** removing `applyExtractedFields` + pill UI + Chunk D handlers (only after the new path is stable).
6. **Then** start promote-design.md if the user approves.

## Don't re-explore

- **Why redesign-v2 over fixing the form-fill bugs:** we tried that approach across Chunks A–D today. The remaining bugs are architectural (mode gating, modal coordination, no acknowledgement) — they'd compound rather than resolve.
- **chat-ui auth model:** app-level Google OAuth via GIS + ID-token verification. Cross-origin iframe / popup uses cookie path (`SameSite=None; Secure; HttpOnly`) with postMessage `auth_required`/`auth_token` fallback for partitioned cookies. Hub uses Supabase Auth + Google provider — token shapes differ; the GIS handler in `EmbeddedChatPanel.tsx` exists to acquire a Google ID token chat-ui will accept.
- **Why `IdeaDetailModal` is read-only:** intentional — the editing surface is `AddStrategicIdeaModal` in edit mode. Don't add form-fill to the detail modal; the redesign uses the chat as the editing surface for AI-driven changes.
- **Why we shipped Chunk D earlier today even knowing it would be deleted:** it correctly identified the problem (planning conv lacks a real id at write time) and we needed to verify the symptom before pivoting. Sunk cost; the pattern (sentinel detection + SSE + Edge Function call) is reused.

## Pending on user's side

- (Optional cleanup, no urgency) Delete the unused IAP-flavored OAuth client `535171325336-fhsjk06js2...` in Cloud Console.
- Decide whether `promote-design.md`'s "department has prod project = low-risk" is the right gate, or if a per-PROJ `requires_committee_review` flag is needed (open question in the promote doc).

## User preferences (learned over this and prior sessions)

- **Direct + terse responses.** No fluff, no pre-amble, no end-of-turn summaries unless meaningful.
- **"Go ahead in order"** = autonomous progression through phases. User won't micro-approve each step.
- **Will commit + push autonomously** when given approval; will rebase if the remote diverged.
- **`gcloud auth` expires periodically.** When deploys fail with "Reauthentication failed", user re-auths interactively. Vertex AI auth: `gcloud auth application-default login`.
- **Uses VPN for `thehub.gue5ty.com`.** The `*.run.app` URLs work without VPN — useful for testing.
- **Loops:** the user is comfortable with `<<autonomous-loop-dynamic>>` wakeups for waiting on long builds. Use ScheduleWakeup for cloud builds (~3-5 min) rather than poll-sleep.
- **Quality bar:** trace bugs to root cause from code, not from logs alone. Surface architectural issues as architectural issues, not as "it broke".
- **Honest about capacity.** Say "I'm tight on context" and recommend a fresh session rather than push through degraded.

## Quick reference

```
Live URLs
  Hub (VPN):           https://thehub.gue5ty.com/
  Hub (no VPN):        https://ai-innovation-hub-721337864706.us-central1.run.app
  chat-ui:             https://n8n-chat-ui-535171325336.europe-west1.run.app
  Hub repo (sibling):  /Users/alvaro.cuba/code/AI-Innovation-Hub-Vertex
  Hub remote:          kurtpabilona-code/AI-Innovation-Hub-Vertex (alvarocubaa has push)
  Hub Supabase:        ilhlkseqwparwdwhzcek

Hub Cloud Build approval
  gcloud beta builds list --project=ai-innovation-484111 --limit=3 \
    --format="value(id,status,substitutions.COMMIT_SHA)"
  gcloud beta builds approve <id> --project=ai-innovation-484111

OAuth client (chat-ui)
  535171325336-lohp54d4kp8npumfp8bgm4bttnlg6v48.apps.googleusercontent.com
  JS Origins include: chat-ui prod URL + both Hub URL forms
  Console: https://console.cloud.google.com/apis/credentials/oauthclient/<above-id>?project=agentic-workflows-485210

chat-ui deploy
  ./deploy-cloudrun.sh --ui-only
  (mktemp gotcha on macOS: rm -f /tmp/cloudbuild-chat-*.yaml if it complains File exists)

Rollback (chat-ui)
  gcloud run services update-traffic n8n-chat-ui --region=europe-west1 \
    --to-revisions=<prev-revision>=100

Rollback (Hub)
  gcloud run services update-traffic ai-innovation-hub --region=us-central1 \
    --project=ai-innovation-484111 --to-revisions=<prev-revision>=100
```

## Today's commits (for diff context)

- chat-ui:
  - `d586745` Chunk C — `https://thehub.gue5ty.com` allowed as parent origin
  - `f1c0951` Chunk C — hide planning JSON in embed mode (will be deleted by redesign-v2)
  - `d043e43` Chunk A — three-phase planning system prompt
  - `b1473f4` Chunk C — popout-window auth routing + thehub.gue5ty.com allowlist
  - `b9a43f8` Chunk D — auto-save handoff (will be deleted by redesign-v2)
- Hub:
  - `8f1a648` Chunk A initial — z-index + GIS auth_required handler
  - `01382ac` Chunk B — z-index regression + form preserve on close
  - `1d4b386` Chunk C — pop-out window with handoff-and-restore
  - `b193bf6` Chunk D — Phase 3 handoff (will be deleted by redesign-v2)

## Don't break

- The Phase 1 interview rule in `<rule name="planning_mode">` (Chunk A) — the AI's behaviour when interviewing the user is correct and load-bearing.
- The pop-out window (Chunk C) — works end-to-end with `window.opener` postMessage routing.
- The auth flow (drawer + popup) — adding origins to the allowlist requires both `chat-ui/src/lib/embed.ts` AND the OAuth client's "Authorized JavaScript origins" in Cloud Console.
- The `n8n-builder-callback` Edge Function — it links workflows to initiatives on every deploy. Untouched by redesign-v2.

Once redesign-v2 ships and is verified, you can move to `promote-design.md` — but do address its 6 load-bearing review items before starting that implementation.
