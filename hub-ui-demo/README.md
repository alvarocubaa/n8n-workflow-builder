# Hub UI — n8n Workflow Attribution demo bundle

Live walkthrough of the 5 PRs (#12 schema, #13 picker, #14 health card, #15 admin, #16/#17 fixes). Captured 2026-05-03 → 2026-05-04 against `https://ai-innovation-hub-hoepmeihvq-uc.a.run.app` revisions `00073-cr9` → `00074-j9g` (post-#16) → `00075-zjn` (post-#17).

## Files

- **`SLACK-DRAFT.md`** — Slack message to manager (3 length variants)
- **`DEMO-SCRIPT.md`** — 3-4 minute demo script with frame-by-frame storyboard for video recording
- **`UX-FINDINGS.md`** — issues found during the walkthrough (P0/P1/P2 with file pointers)
- `01-` to `21-` — screenshots in narrative order

## Screenshots, in story order

### Setup + flow (1–13, post-PRs #12–16)
| # | File | Caption |
|---|---|---|
| 01 | [01-login.png](./01-login.png) | Login page — Google OAuth via Supabase |
| 02 | [02-overview.png](./02-overview.png) | Overview dashboard after sign-in |
| 03 | [03-pipeline-team-ideas.png](./03-pipeline-team-ideas.png) | Innovation Pipeline → Team Ideas tab |
| 04 | [04-roadmap-initiatives-list.png](./04-roadmap-initiatives-list.png) | Roadmap Initiatives tab — the table our PRs target |
| 05 | [05-health-card-empty-state.png](./05-health-card-empty-state.png) | **PR #14**: Workflow Health card empty state |
| 06 | [06-picker-PRE-fix-env-bug.png](./06-picker-PRE-fix-env-bug.png) | **Bug found**: picker shows "VITE_N8N_OPS_URL not configured" |
| 07 | [07-admin-PRE-fix-env-bug.png](./07-admin-PRE-fix-env-bug.png) | Same bug on admin page |
| 08 | [08-admin-suggestions-WORKING.png](./08-admin-suggestions-WORKING.png) | **Post-fix #16**: 6 fuzzy-match candidates rendered |
| 09 | [09-picker-WORKING-empty.png](./09-picker-WORKING-empty.png) | **Post-fix #16**: picker renders cleanly |
| 10 | [10-picker-autocomplete-marketing.png](./10-picker-autocomplete-marketing.png) | **PR #13**: live autocomplete (847 workflows) |
| 11 | [11-picker-chip-added.png](./11-picker-chip-added.png) | **PR #13**: chip with star + role dropdown |
| 12 | [12-edit-saved-confirmation.png](./12-edit-saved-confirmation.png) | "Initiative Updated!" — link saved to Supabase |
| 13 | [13-health-card-with-link-pending-stats.png](./13-health-card-with-link-pending-stats.png) | Health card with linked workflow row, stats pending |

### Click-test that found a 2nd bug + final fix (14–21, post-PR #17)
| # | File | Caption |
|---|---|---|
| 14 | [14-picker-two-chips-pre-fix.png](./14-picker-two-chips-pre-fix.png) | Two chips, attempting primary flip |
| 15 | [15-picker-flip-primary-buggy-pre-fix.png](./15-picker-flip-primary-buggy-pre-fix.png) | Star flipped — visually but Supabase save **silently fails** with 409 |
| 16 | [16-picker-two-chips-post-fix.png](./16-picker-two-chips-post-fix.png) | **Post-fix #17**: primary flip persists correctly to Supabase |
| 17 | [17-health-card-LIVE-with-real-stats.png](./17-health-card-LIVE-with-real-stats.png) | **Health card with real data + "synced just now" cue** |
| 18 | [18-health-card-expanded-real-data.png](./18-health-card-expanded-real-data.png) | **+1 more** expanded — Get Account Calls: 8,362 runs / 56.9% / 58.6s p95 / sparkline showing the **3,024-error spike on Apr 29** then recovery |
| 19 | [19-admin-page-post-fix.png](./19-admin-page-post-fix.png) | Admin page rendering correctly |
| 20 | [20-admin-checkbox-active.png](./20-admin-checkbox-active.png) | 1 candidate selected, "Confirm 1" button active |
| 21 | [21-admin-after-bulk-confirm.png](./21-admin-after-bulk-confirm.png) | Bulk-confirm worked: 6 → 5 candidates (PMM HubSpot now linked) |

## End-to-end verified

Live during the walkthrough:
- ✅ Sign-in (workaround via Cloud Run URL)
- ✅ Workflow Health card empty state, with link, with real stats + sparkline
- ✅ Picker autocomplete (868 workflows from public `/workflows`)
- ✅ Add chip, change role, **flip primary star** (post-#17), remove chip
- ✅ Save flow — 2 rows persisted to `initiative_workflow_links` with correct `is_primary` semantics
- ✅ "+N more" expand, R/Y/G health flag, Sparkline rendering with real data
- ✅ Admin `/admin/n8n-link-suggestions` page — load, threshold tune, bulk-confirm
- ✅ "synced just now" cue (P2 #2)
- ✅ Picker error block (P2 #3, would show on env failure)
- ✅ Threshold input `lang="en-US"` (P2 #4)

## Bugs caught + fixed during walkthrough

| Bug | Detection | PR | Status |
|---|---|---|---|
| `VITE_N8N_OPS_URL` not in build args → picker + admin both fail at runtime | Live UI showed the error message | [#16](https://github.com/kurtpabilona-code/AI-Innovation-Hub-Vertex/pull/16) | Merged + deployed |
| Primary-flip silently fails with 409 (`idx_iwl_one_primary` unique index) when reassigning primary | Console error during click-test | [#17](https://github.com/kurtpabilona-code/AI-Innovation-Hub-Vertex/pull/17) | Merged + deployed |

## Outstanding items (in `UX-FINDINGS.md`)

- 🔴 **P0** — `thehub.gue5ty.com` returns CloudFront 403 (pre-existing infra issue, needs IT/DNS)
- 🟠 **P1** — `/sync-hub` returns 200 but writes 0 rows on manual trigger (filed; daily 06:15 UTC scheduled cron may have different behavior; demo screenshots use seeded data via Supabase Management API)
- 🟡 **P2** — 3 of 6 polish items shipped in #17 (synced cue, error block, locale). Remaining: detail-modal scroll length, empty-card CTA, picker-reuse-for-innovations note.

## Real-world data captured

- **15,194** executions in `n8n_ops.executions` (last 7 days)
- **125** unique workflows tracked
- Top 24h:
  - Kurt's `Get Account Calls` (1,023 runs / 99.9%) — healed from 3,024 errors on Apr 29
  - Inbal's `Article translations` (444 runs / 100%)
  - 2 workflows currently red: `Zendesk Tickets` (45.8%) + `Who Does What Agent PROD` (33.3%) — perfect candidates for follow-up triage
- 5 freshness alerts logged in `n8n_ops.alert_state` over 3 days

## Reproducible from scratch

The seed SQL used to populate the Health card screenshot is preserved in [`UX-FINDINGS.md`](./UX-FINDINGS.md) (matches real BQ rollup numbers from `n8n_ops.daily_workflow_stats` for `7aAGjViGosj1RtqM`).
