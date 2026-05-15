# Next session brief — Session 11: PoC modal trim + Smart-Add Skip Analysis

**Last touched:** 2026-05-15 — Sessions 9 + 10 both shipped same day (Track A initiative-KPI auto-sync; Track B PoC Builder CTA + poc_mode). Session 11 promoted to HEAD.

## What you're picking up

Track B Session 11 is the **smallest UX cut** on the Hub side. Hub-only — no chat-ui or n8n-ops work. Reduces modal stacking when starting a PoC, and adds a power-user shortcut to skip AI analysis on Smart Add.

This is the final session in the Track B "Hub × n8n-builder UX polish" arc that ran across Sessions 5 → 10. After this lands, the whole loop is shipped.

## Scope (Hub only)

**1. Retire `StartPocModal` as a standalone modal.**
- Fold its 6 fields into `EditInnovationItemModal`'s PoC section as a top-of-modal expanded group: `title`, `description`, `poc_guidelines_doc`, `solution_url`, `validation_notes`, `test_data_source`, `owner`.
- Update both call sites in `components/views/InnovationPipeline.tsx`:
  - `handlePocSubmitFromIdea` → open `EditInnovationItemModal` with `startPocFlow=true`
  - `handlePocSubmitFromInitiative` → same pattern
- Today's UX: clicking "Start PoC" opens StartPocModal, user fills in, submits, then the system opens EditInnovationItemModal so they can finish editing other fields. Two modals deep.
- After: one modal. The PoC fields are pre-expanded; everything else stays collapsed.

**2. Add "Skip Analysis" toggle to `SmartAddIdeaModal`.**
- One checkbox at the bottom; defaults off.
- When on: bypass the 3-step AI feasibility/dedupe flow and submit directly to `innovation_items` insert.
- Use case: power user who already knows the idea is real + unique.

## Files likely touched

- `components/modals/EditInnovationItemModal.tsx` — add `startPocFlow` prop; expand PoC section by default when set; include the 6 PoC-creation fields.
- `components/modals/StartPocModal.tsx` — delete (after confirming no other callers).
- `components/views/InnovationPipeline.tsx` — update both call sites.
- `components/modals/SmartAddIdeaModal.tsx` — add "Skip Analysis" checkbox + bypass branch.

## Verification

- Start a PoC from an approved idea → no two-modal-deep nav; lands directly on the consolidated edit form with PoC fields populated.
- Start a PoC from a Roadmap Initiative → same flow.
- Smart Add Idea with "Skip Analysis" on → idea row created without AI analysis fields; idea still appears in "New Ideas" column.
- Regression: existing Smart Add flow (Skip Analysis off) still works end-to-end.

## Risk + rollback

- **Retiring `StartPocModal` is the only meaningful UX change.** Gate behind a Hub feature flag if one exists; otherwise demo to Kurt before merging the deletion. The Skip Analysis toggle is purely additive.

## Adjacent items (lower priority)

- **Hub PR #53 review + merge** (Session 10 — PoC Builder CTA). Currently open; pending Kurt review. If you ship Session 11 before #53 merges, coordinate so they don't conflict in `IdeaDetailModal.tsx`.
- **Browser-driven E2E smoke for Session 10** (both PoC pipelines: Initiative-path + Idea-path). IAP-protected; user-driven. Once green, document outcome in decision-log.
- **Kurt DM** about Time Saved KPI UI label (Session 9 follow-up). Slack draft in `D0A9V1YRRQT` since 2026-05-13. Send when ready.
- **Feedback-loop harvest** — Apr 15 last run, overdue ~30 days. `cd chat-ui && NODE_PATH=./node_modules npx tsx ../tools/harvest_test_cases.ts`.

## What's already shipped (do NOT redo)

- Marketing Time Saved KPI live in Hub (April 38h, May 88h).
- Initiative-KPI auto-sync daily 06:15 UTC (`n8n-ops-00008-vqf`). Verified live: #214 PFR=1h, #213 PMM=0h, #193 ORM untouched.
- PoC Builder CTA on PoC cards (chat-ui rev `n8n-chat-ui-00047-wgk`; Hub PR #53). `poc_mode` rule live; `<poc_context>` plumbed end-to-end; both PoC pipelines (Initiative-path + Idea-path) handled.
- Hub PR #51 (Baseline Metrics form strip) merged. Hub PR #52 (`innovation_items.solution_url` + Edge Function write path) merged.

## User preferences (carried forward)

- **Direct + terse.** No fluff.
- **Verify-before-destructive** especially when touching multiple call sites or deleting components. Grep first.
- **`gcloud auth` expires periodically.** Run `gcloud auth login` interactively when needed.
- **Will commit + push autonomously** when given approval.

## Estimated effort

2-3 hours. Hub-only, scope-bounded.

## Quick reference

```
Hub repo path:           /Users/alvaro.cuba/code/AI-Innovation-Hub-Vertex/
Hub Cloud Run direct:    https://ai-innovation-hub-hoepmeihvq-uc.a.run.app/
Hub VPN URL:             https://thehub.gue5ty.com/
chat-ui Cloud Run rev:   n8n-chat-ui-00047-wgk (Session 10, live)
n8n-ops Cloud Run rev:   n8n-ops-00008-vqf (Session 9, live)
Hub Supabase:            ilhlkseqwparwdwhzcek
```
