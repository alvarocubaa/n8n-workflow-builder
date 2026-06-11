# Decision Log — n8n Workflow Builder

System / config / architectural decisions for the **chat-ui + n8n-mcp + n8n-skills + specs**
workflow builder. New entries on top.

> **Repo split — 2026-06-11.** This log's prior contents (2026-05-08 → 2026-05-24)
> were entirely the **Time-Saved KPI sync saga** and the **chat-ui↔Hub integration
> saga** — both of which now live with their owning products:
>
> | Topic | Now maintained in |
> |---|---|
> | n8n-ops service: KPI sync, cron, rollup, BigQuery ingest, alerts | `alvarocubaa/n8n-ops` → `docs/decision-log.md` |
> | Cross-product integration (chat-ui↔Hub: PoC builder, prefill, form sections, baseline-strip, Session 10/11/13) | `cubaalvaro/claude-workspace-roots` → `AI Innovation Integration/decision-log.md` |
>
> The **full pre-split combined history** (all entries, fully cross-referenced) is
> preserved immutably at the **`pre-split-2026-06-11` git tag**:
> `git show pre-split-2026-06-11:docs/decision-log.md`.
>
> Builder-only decisions (prompt engineering, n8n-mcp, departments, credential
> guardrails, feedback-loop) historically lived in `MEMORY.md` and `CLAUDE.md`,
> not here. **New chat-ui / MCP / skills / specs decisions go below, newest on top.**

---

## Older entries

(Decision log started 2026-05-08; older decisions live in MEMORY.md until extracted. The 2026-05-08 → 2026-05-24 entries were carved to the n8n-ops and integration logs on 2026-06-11 — see the split notice above.)
