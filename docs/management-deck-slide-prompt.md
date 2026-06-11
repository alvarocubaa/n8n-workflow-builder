# Management Deck — n8n Builder Agent Slide Prompt

*Saved 2026-04-17. Use for the next management update to the AI Infrastructure deck.*

**Context**: Follow-up to the prior "n8n Builder Agent" slide in the AI Infrastructure deck. Style matches the sibling slide "Internal Guesty Apps: Secure & Automated Delivery Pipeline" (dark navy headings, blue/teal accents, flat outlined icons, white background).

**Data cutoff**: Numbers reflect the Apr 1, 2026 Firestore pull captured in `feedback-loop/STATE.md` (v0.22 window, Mar 27 – Apr 1). If re-using after May 2026, refresh via `gcloud auth application-default login` → hit `/analytics` → update the Usage & Impact block.

---

## Copy-paste prompt

```
Create one executive-ready slide that is a direct follow-up to our previous "n8n Builder Agent" update. Preserve visual continuity with that slide.

HEADER BAR (thin, full-width, dark navy background, white text, top-left):
AI INFRASTRUCTURE

TITLE (dark navy, bold):
n8n Builder Agent: From Workflow Copilot to Full-Stack Workflow & Data Platform

LAYOUT: Three columns, matching the previous update's structure.

LEFT COLUMN — "The Platform, Evolved":
A clean architecture diagram in blue/teal showing the dual-mode flow:
User (browser, IAP-protected)  →  Chat UI (Next.js on Cloud Run)  →  Claude Sonnet 4.6 (Vertex AI, 800K context)  →  [branch 1] Builder Agent → n8n Cloud (one-click deploy, tagged "AI Generated")  /  [branch 2] Data Consultant → BigQuery / Specs / AI Agent Plans
Side panel under the diagram: "4-layer knowledge — System Prompt · Department Config · 11 Data Specs · 7 n8n Skills"
Caption: "One assistant, two modes. Any Guesty employee can now build a production workflow OR explore data and design AI agents — in minutes, no code."
Keep the robot illustration from the previous slide for continuity, but show it with two output branches instead of one.

MIDDLE COLUMN — "Since the Last Update" (use green check icons):
Frame each bullet as a commitment delivered:
✓ Cloud Run + IAP Live — Deployed to production (agentic-workflows-485210, europe-west1). IAP fronts the UI, MCP runs internal-only. Monorepo on GitHub.
✓ Use Cases Verified Across Departments — UC1 Finance (Zuora), UC2 CX (Zendesk), UC3 CS (Salesforce native) all passing. Marketing hackathon: 12/12 workflows deployed. 247 real conversations harvested across all 6 departments.
✓ Regression & Quality Loop Built — Replaced "CI regression" plan with a stronger pattern: 26-case regression suite + automated harvester that turns real conversations into test candidates + audit tool that catches credential, projectId, and config bugs before deploy.
✓ Scope Expanded — Data Consultant Mode — New second mode for schema exploration, SQL generation, and AI agent planning. Same chat UI, different system prompt and tool set.
✓ 10× Context Window — Bumped from 80K → 800K tokens (Sonnet 4.6 GA on Vertex AI). 31% of recent turns would have lost data under the old limit.
✓ Analytics Dashboard Live — Admin-only /analytics page: usage by dept, quality metrics, ROI calculator, deploy tracker, feedback log. Every chat turn and deploy logged to Firestore.

Below these bullets, a small "Departments Live" strip showing the 6 production departments as icon tiles:
- CX (primary user, Zendesk + Jira)
- CS (Salesforce + CSM)
- Marketing (HubSpot)
- Payments (Zuora)
- Finance (Zuora + AdminData)
- OB (Salesforce + AdminData)

RIGHT COLUMN — "Usage & Impact" + "Next Steps":

USAGE & IMPACT (small stat strip, teal accents):
- 214 chat turns · 247 conversations harvested · 4 active users (last sprint)
- Verified deployed workflows: Zendesk upsell intent (15 nodes) · SF vs Zuora comparison (12) · GuestyPay Inactive Monitor (31) · Universal Client Reporting · ZD Master Sheet → Zendesk
- Speed: 2–5 business days  →  5–15 minutes per workflow
- ROI example: 31-node Payments workflow ≈ $500 of engineering time saved per build
- Zero output truncations across 214 turns

NEXT STEPS:
Three items with icons, matching the previous slide's style:
1. Wire regression suite into Cloud Build — Last remaining piece of the original CI/CD vision; harvester + audit tool already in place.
2. Grow Data Consultant adoption — Currently 0.5% of turns. Promote to data-curious teams (Finance, Payments, Analytics) with targeted use cases.
3. Self-improving spec loop + broader user base — Feed deployed workflow execution results back into specs ("this SQL pattern failed in prod, use X"). Expand active users beyond CX, which drives 71% of usage today.

BOTTOM FOOTER STRIP (small, subtle, teal accent):
Impact: 6 departments live · 800K context window · 5+ verified production workflows · Workflow build time 2–5 days → 5–15 min · Full analytics + feedback loop running.

VISUAL STYLE:
- Match the previous slide exactly: Guesty dark navy headings, light blue/teal accents, clean rounded icon tiles, white background, no stock photos.
- Use the same icon style as the reference (flat, outlined, blue/teal — Salesforce, Zendesk, Jira, Slack, BigQuery logos for the departments strip).
- Keep the robot/agent illustration consistent with the previous slide.
- Do NOT include speaker notes.
```

---

## How to refresh the numbers before reusing

1. `gcloud auth application-default login` (ADC file at `~/.config/gcloud/application_default_credentials.json` was empty when this doc was written).
2. Rebuild/restart `docker-compose up -d` so the container picks up fresh creds.
3. Visit `http://localhost:3004/analytics` — copy the cumulative hours-saved / $ value and the current sprint's event/deploy counts.
4. Update the USAGE & IMPACT block (event count, active users, deployed workflows list, ROI example).
5. Update the middle column if any new commitments have been delivered since v0.22.
