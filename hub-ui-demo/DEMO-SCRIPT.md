# Hub UI — n8n Workflow Attribution demo script (3-4 min)

Audience: AI Team / leadership. Goal: show a strategic initiative now has live, per-workflow operational health alongside its KPI/business signals — and that any AI Team admin can attach a workflow in 30 seconds.

**Pre-flight (do once before the demo)**:
1. Sign in at `https://ai-innovation-hub-hoepmeihvq-uc.a.run.app/` (the Cloud Run URL — avoids the broken custom domain). If sign-in lands you on a 403, copy the `#access_token=…` fragment from the URL bar and paste it onto the Cloud Run URL.
2. Confirm the picker autocompletes (this needs PR #16 deployed — verify by opening the edit modal of any roadmap initiative and typing "n8n" — you should see workflow names appear).
3. Have one initiative pre-linked to a real, active workflow so the Health card has data. If `/sync-hub` hasn't run yet today, manually trigger it: `gcloud scheduler jobs run n8n-ops-sync-hub --location=europe-west1 --project=agentic-workflows-485210`.

---

## 1. The "why" (15s)

> "We've shipped 30+ n8n workflows across departments but had no way to tie them back to the strategic initiatives they're powering — or to know which ones are silently failing. The Hub now closes that loop."

**Show**: Innovation Pipeline → Roadmap Initiatives tab. Mention that today we're going to walk one initiative end-to-end.

📷 Screenshot: [`hub-06-initiatives-all.png`](./hub-06-initiatives-all.png)

---

## 2. The detail view — Workflow Health card (45s)

Click into "Guesty Marketing Cowork Slack MAS (Multi-Agent System)" — an Agent-type roadmap initiative.

> "This is a real initiative — Pilot, Q2 2026 ETA, 'Improved Quality' KPI. What's new: between Impact & KPI and Effort & Planning, there's a **Workflow Health** card. It pulls last 7 days from BigQuery via our `n8n-ops` service, joins by workflow links the team curates, and shows the headline for the primary workflow."

**Show**:
- The teal-bordered card
- The R/Y/G health dot, runs count, success %, p95, sparkline
- "+N more" expand if multiple linked workflows

> "If a primary workflow flips to red — like Kurt's `Get Account Calls` did Apr 29, 100% errors all morning — this is where his AVP would notice."

📷 Screenshot: [`05-detail-modal-workflow-health.png`](./05-detail-modal-workflow-health.png) (currently empty state; replace once `/sync-hub` populates)

---

## 3. The edit-modal picker (60s)

Click the pencil icon to enter edit mode. Scroll to the **n8n Workflows** section (sits between Relevant Links and Department Notes).

> "An AI Team admin or Dept Champion can attach the workflows that actually power this initiative. Search by name — autocomplete pulls from the live n8n catalog (847 workflows today). The 'star' marks the primary; the role dropdown captures whether each is `primary`, `data-prep`, `cleanup`, `subflow`, or `other`."

**Show**:
- Type a partial name → suggestions drop down
- Click one → it lands as a chip, auto-marked primary
- Add a second → click its star to flip primary → role dropdown to `data-prep`

> "Save Changes — links land in `initiative_workflow_links` with the curator's user ID. RLS scopes writes to System Admin / AI Team / Dept Champion / Dept Admin."

📷 Screenshot: [`07-edit-modal-picker-empty.png`](./07-edit-modal-picker-empty.png) (currently shows error; replace post-#16-deploy with a proper search results screenshot)

---

## 4. The backfill admin page (45s)

Navigate to `/admin/n8n-link-suggestions` (AI-Team-only).

> "We have ~250 existing initiatives and ~847 workflows. Manual linking is painful, so this page does fuzzy matching — token Jaccard with handle-stripping, so 'Daily Churn Report' matches 'Daily Churn Report - @ron.madar.hallevi' at ~99%."

**Show**:
- Threshold input (default 0.6) — drop to 0.4 to see noisier candidates, raise to 0.8 to see only near-perfect matches
- Pick 3-5 candidates with checkboxes
- "Confirm 5" → bulk insert → confirmation banner shows count

📷 Screenshot: [`08-admin-suggestions-page.png`](./08-admin-suggestions-page.png) (currently shows error; replace post-#16-deploy with a proper candidate list)

---

## 5. The full loop (30s)

> "Once a link exists, the daily 06:15 UTC `/sync-hub` job in `n8n-ops` joins `initiative_workflow_links` × BQ `executions` and writes per-day rollups. By tomorrow morning, the Workflow Health card you just saw empty will be populated. We can also manually trigger `/sync-hub` for the demo if you want to see stats land in real time."

**Optional live trigger**:
```bash
gcloud scheduler jobs run n8n-ops-sync-hub --location=europe-west1 --project=agentic-workflows-485210
```

Refresh the detail modal → Health card now shows runs count + success rate + sparkline.

---

## Closing (15s)

> "What's next: (a) Kurt's CloudFront/DNS fix to restore `thehub.gue5ty.com`, (b) bulk-link the existing initiative backlog via the admin page, (c) add an 'error rate >50% over 1h' alert dimension to `/loop-alerts` so failing workflows page someone instead of just sitting in a dashboard."

---

## Storyboard for video

| Frame | Duration | Action | Voiceover hook |
|---|---|---|---|
| 1 | 0:00–0:05 | Title card: "Hub UI — Workflow Attribution" | "We've shipped 30+ n8n workflows…" |
| 2 | 0:05–0:20 | Roadmap Initiatives list | "Today there's a closed loop." |
| 3 | 0:20–0:50 | Detail modal scroll → Workflow Health card | "Last 7 days, primary workflow, R/Y/G…" |
| 4 | 0:50–1:30 | Edit modal → picker → search → chip → star toggle | "Anyone with the role can attach a workflow in 30 seconds…" |
| 5 | 1:30–2:00 | Save → reopen detail → card with data | "Sync runs at 06:15 UTC, but we can also trigger manually…" |
| 6 | 2:00–2:30 | Admin page → fuzzy candidates → bulk confirm | "And for the backlog — fuzzy matcher with bulk-confirm." |
| 7 | 2:30–2:45 | Architecture diagram (n8n → BQ → n8n-ops → Supabase → Hub) | "End-to-end pipeline." |
| 8 | 2:45–3:00 | Outro card: PR links + "Next: …" | "What's next…" |

## Recording tips

- **Browser**: Chrome incognito, 1440×900 viewport (matches screenshots), zoom 100%
- **Cursor**: enable cursor highlight (built into macOS QuickTime)
- **Audio**: external mic preferred; if narrating live, use a script + 1-take cut
- **Tool**: QuickTime → File → New Screen Recording → choose window → save as `.mov` → optional trim with iMovie
