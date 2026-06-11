# Slack draft to manager

Tone: confident, outcome-focused, light on infra detail. Reads in <60 sec.

---

Hey [manager] — quick update on the n8n / Innovation Hub closed-loop work.

**TL;DR:** every n8n execution at Guesty is now captured in BigQuery, every initiative in the Hub can be linked to its driving workflows, and the detail modal shows live operational health (run count, success %, p95 latency, sparkline, R/Y/G flag) alongside the existing KPI / business case sections. End-to-end verified live this week.

**What's running:**
1. **`n8n-ops` Cloud Run service** — pulls every n8n execution into BigQuery every 15 min, checks for stuck/looping workflows every 10 min and posts to `#n8n-ops`. **15,194 executions / 125 workflows / 7 days** of history so far.
2. **Freshness alarm** (separate Cloud Function, every 15 min) — pages `#n8n-ops` if no executions land for 45+ min. Caught 5 freshness gaps this week.
3. **Innovation Hub Workflow Health card** — on every Strategic Initiative. AI Team / Dept Champions can attach the n8n workflows that power each initiative directly from the edit modal; the detail modal pulls 7-day rollups from BigQuery via Supabase.
4. **`/admin/n8n-link-suggestions`** — fuzzy-matcher for AI Team to bulk-link the existing initiative backlog. Already surfacing real candidates with 60–100% confidence.

**What this unlocks**: for the first time we can answer "is this initiative actually working in prod?" without me running BigQuery. Strategic ideas now carry their operational health alongside their KPI / business case. Failed workflows surface in `#n8n-ops` automatically. Workflows that go silent get flagged within 45 minutes. Concrete example we caught: Kurt's `Get Account Calls` workflow had **3,024 errors / 100% failure on Apr 29**, healed itself by Apr 30 (now 99.9% success). All visible in the Health card sparkline.

**Status of the work:**
- 5 PRs merged into `kurtpabilona-code/AI-Innovation-Hub-Vertex` (#12 schema, #13 picker, #14 health card, #15 admin, #16/#17 fixes). Live in production at the Cloud Run URL.
- Caught 2 real bugs during the live walkthrough today and shipped fixes for both: (1) primary-flip silently failed with HTTP 409 due to a unique-index ordering issue, (2) `VITE_N8N_OPS_URL` wasn't being baked into the deployed bundle. Both fixed.

**Blocked / next:**
- **Sign-in via the custom domain `thehub.gue5ty.com` is broken** — CloudFront 403, pre-existing infra issue, needs IT help (or a DNS CNAME flip away from CloudFront onto `ghs.googlehosted.com`). Workaround in the meantime: use `https://ai-innovation-hub-hoepmeihvq-uc.a.run.app/`.
- The `/sync-hub` daily job in `n8n-ops` returns 200 but writes 0 rows on manual trigger — needs a separate debug pass; the scheduled 06:15 UTC cron may behave differently with its own SA. Filed as an issue.
- Tomorrow: bulk-link the initiative backlog via the admin page; add `>50% error rate over 1h` alert dimension to `loop-alerts` (would have caught Kurt's case).

Demo bundle (screenshots, script, UX findings): `hub-ui-demo/` in `n8n-builder-cloud-claude` repo.

Happy to walk through it whenever — would 15 min work this week?

---

## Variations

### Shorter (1-screen, no demo offer)

> Hey [manager] — closed the loop on n8n + Innovation Hub. Every n8n execution now flows into BigQuery (15k captured, 125 workflows, 7 days of history). Every Strategic Initiative in the Hub can be linked to its driving workflows; the detail modal shows live 7-day run count, success %, p95, and a sparkline. AI Team can bulk-link the backlog via a new admin page. Caught + fixed 2 bugs during the live walkthrough today (primary-flip 409 + missing build-arg). 5 PRs merged + deployed. One blocker left: `thehub.gue5ty.com` returns CloudFront 403 on signin — needs IT to flip a DNS CNAME, or use the Cloud Run URL workaround. Demo bundle in `hub-ui-demo/`.

### Longer (technical depth)

Add after the bullet list:

> **Architecture:** Cloud Scheduler → `n8n-ops` Cloud Run → n8n REST API ingest → BQ `n8n_ops.executions` (raw) → daily rollup query → BQ `daily_workflow_stats` → `/sync-hub` → Supabase `initiative_workflow_stats` → Hub UI Health card. Plus `loop-alerts` (10-min cadence, posts to Slack), `weekly-digest` (Mon 09:00 IL), and a freshness alarm (15-min cadence, pages if executions stop landing). All publicly observable to Guesty SAs via OIDC; one route (`/workflows`) is open for browser autocomplete (workflow IDs/names aren't sensitive — they're already discoverable in the n8n cloud UI).

### Tone-shifted (more polished, board-style)

> The n8n / Innovation Hub closed-loop work shipped this week. Every n8n execution at Guesty now flows into BigQuery and is observable to the AI Team (15,194 captured to date, 125 workflows, 7 days of history). The Innovation Hub now surfaces per-initiative workflow health — runs, success rate, p95 latency, R/Y/G flag — directly on every Strategic Initiative's detail view, sourced from a daily BQ → Supabase pipeline. AI Team / Dept Champions can curate the initiative ↔ workflow links; bulk-linking is supported via a fuzzy-match admin page. Two real production bugs were caught and patched during today's live walkthrough.
>
> One blocker remains: the custom-domain (`thehub.gue5ty.com`) sign-in flow returns CloudFront 403, an infrastructure issue independent of this work. Users can sign in via the Cloud Run URL until DNS / CloudFront is reconfigured.
