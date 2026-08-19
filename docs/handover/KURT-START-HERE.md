# Start here — the n8n Builder and the n8n bundle

Kurt — this is the orientation for the two systems coming to you. **About 15 minutes**, or 3 if you
only read §1 and §5.

If a command fails, don't debug it — note it and bring it. Access gaps are the fastest thing to fix
and they're what the meeting is partly for.

---

## 1 · What you're taking on, in four sentences

Two systems with the same owner and different shapes. The **Builder** is a chat product that turns
plain-English descriptions into production-ready n8n workflows — request/response, IAP-gated, and its
generated workflows land *inactive* so nothing runs until a human says so. The **bundle** is
`n8n-ops`: a Cloud Run service on six schedulers that ingests **every n8n execution across Guesty**
into BigQuery and computes the Time-Saved KPI the Innovation Hub displays. The Hub itself is already
yours — what's new is the measurement layer underneath it.

Both are healthy and in daily use: 313,115 executions recorded, all schedulers running, verified
2026-08-19.

---

## 2 · The repos

You have an **admin invite** to each of these — accept it and you're in.

| Repo | What |
|---|---|
| [`alvarocubaa/n8n-workflow-builder`](https://github.com/alvarocubaa/n8n-workflow-builder) | chat-ui, MCP source, 11 specs, 7 skills |
| [`alvarocubaa/n8n-ops`](https://github.com/alvarocubaa/n8n-ops) | ingest, alerts, digest, KPI rollup |
| [`alvarocubaa/n8n-mcp-cloud`](https://github.com/alvarocubaa/n8n-mcp-cloud) | revendored MCP server (v2.59.3) |
| `kurtpabilona-code/AI-Innovation-Hub-Vertex` | the Hub — already yours |

---

## 3 · The 2-minute version

Open **[Builder & Bundle](https://claude.ai/code/artifact/4b3d9f87-a3fb-48b6-aa97-e2d373dc897c)** — one page covering the architecture of both systems, how
work is scheduled, and how the KPI is computed. It's what I'll walk through in the meeting.

---

## 4 · Read these two, in this order

| File | Why | Time |
|---|---|---|
| [`n8n-ops/docs/handover/HANDOVER.md`](https://github.com/alvarocubaa/n8n-ops/blob/main/docs/handover/HANDOVER.md) | the busier system — six schedulers, how the Time-Saved KPI is actually computed, how to deploy | 15 min |
| [`n8n-workflow-builder/docs/handover/HANDOVER.md`](HANDOVER.md) | the Builder — knowledge layers, the deliberate node overrides, how it deploys | 10 min |

Both are written to be read cold, including by an agent:

> *"Read docs/handover/HANDOVER.md. What does this system do, and how does a change reach
> production?"*

If it can't answer something, that's a documentation gap — tell me and I'll fix it.

---

## 5 · Run the access check

```bash
git clone https://github.com/alvarocubaa/n8n-workflow-builder.git
cd n8n-workflow-builder && ./docs/handover/verify-access.sh
```

Read-only, about a minute. It checks every repo, service, scheduler, secret and dataset you need,
and exits non-zero on anything unreachable.

**GCP checks will fail until your project access is granted** — that's expected, and the output is
exactly the list we use to get it sorted. Send it either way.

---

## 6 · Worth having a view on

Not homework — just the things where your preference decides the answer:

1. **Deploys.** `n8n-chat-ui` and `n8n-ops` deploy by hand; `n8n-mcp-cloud` auto-deploys on push to
   `main`. Do you want the other two wired up to triggers, or is running the scripts fine?
2. **The shared service account.** `n8n-workflow-builder@` runs both systems plus the Hermes VM.
   Leave it shared, or split out a dedicated one for n8n-ops?
3. **The Hub embed.** There's a drafted ticket to move `n8n-chat-ui` from IAP to app-level OAuth,
   which is what an embedded chat panel in the Hub would need. Still wanted?
4. **An unmerged branch** holds a BI data-dictionary layer and a dormant `agent_logs` writer, with
   design notes describing that table as shared with a GenBI Slack agent. Land it or drop it?

---

## 7 · What we'll do in the meeting

Walk the architecture of both systems, get your access sorted, and agree the few open questions
above. If steps 4–5 went badly we'll spend the time there instead, which is also fine.
