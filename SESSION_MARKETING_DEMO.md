# Marketing All-Hands Demo — Speaker Notes & Prompts

## DEMO PROMPT 1: Workflow Builder (copy-paste this)

```
Build a daily workflow that runs at 8am UTC. Query BigQuery marketing_data tables for HubSpot email campaign performance from the past 7 days. Include campaign name, emails sent, opens, clicks, and unsubscribes. Use the Google Gemini node to generate a 3-bullet insight summary highlighting top and underperforming campaigns. Post the summary to #marketing-insights in Slack. Write the raw metrics to a Google Sheet.
```

When AI responds with Phase 1 plan, say: **"Looks good, build it"**

Expected result: 7-node workflow (Schedule → BigQuery → Gemini AI → Slack + Google Sheets)

---

## DEMO PROMPT 2: Data Consultant (copy-paste this)

```
Show me our top 10 marketing campaigns by conversion rate in the last 30 days. Include lead count, conversions, conversion rate, and revenue.
```

Expected result: Ready-to-run BigQuery SQL + explanation of what each part does.

---

## SPEAKER NOTES (glance at these)

### Slide 1: What is this? (1.5 min)

- "This is an AI assistant that builds n8n automations for you."
- "You describe what you need in plain English — it builds a production-ready workflow with the right credentials, data sources, and schedule."
- Two modes: **Builder** (builds automations) and **Data Consultant** (answers data questions)
- Already knows Marketing's stack: HubSpot, Salesforce, Slack, Sheets, BigQuery
- **Before:** Submit request → wait for dev → 2-5 business days
- **After:** Describe → review → deploy → 5-15 minutes

### Demo 1: Workflow Builder (3-4 min)

- Select **Marketing** department
- Paste prompt 1
- Narrate while waiting: "It's reading our HubSpot data spec, checking credentials, planning the workflow..."
- When Phase 1 appears: "See — it tells me exactly what it's going to build before building it. I can adjust here."
- Say "Looks good, build it"
- When workflow appears: "7 nodes. BigQuery pulls the data, Gemini analyzes it, Slack gets the summary, Sheets gets the raw numbers. One click to deploy."
- Hit Deploy (or just show the button)

### Demo 2: Data Consultant (2-3 min)

- Switch to **Data Consultant** mode
- Paste prompt 2
- "Different mode — instead of building a workflow, it gives me the SQL query to answer my question."
- When SQL appears: "It found the right table, the right columns, and built a query I can run in BigQuery right now. No guessing table names."
- "I can ask follow-ups: 'break this down by region' or 'which had the highest spend'"

### Talking Points (2 min)

1. **Pre-configured for Marketing.** HubSpot, Salesforce, Sheets, Slack — all ready. No setup.
2. **AI insights, not just plumbing.** Gemini can analyze, summarize, recommend.
3. **Safe.** Deploys to Marketing's sandbox first. You review before anything goes live.
4. **Two modes.** Recurring automation? Builder. Quick data answer? Consultant.
5. **Already in use.** CX and Payments teams are building real workflows today.

### Close (30 sec)

- "Try it. Open the tool, pick Marketing, describe what you need."
- "If it's not right, iterate — just like chatting with a colleague."
- Share the URL

### Q&A Quick Answers

- **"Can it connect to X?"** → HubSpot, Salesforce, Slack, Sheets, BQ, Google Ads, Facebook, Trustpilot, Modjo. We can add more.
- **"Who sees my workflows?"** → Marketing sandbox only.
- **"What if it's wrong?"** → You review before deploying. AI runs self-checks too.
- **"Replacing devs?"** → No. Handles the 80% that's straightforward.
- **"How accurate?"** → 95% on data queries. Uses the same patterns as our best workflows.
- **"Can I use it for reports?"** → Yes — Data Consultant for SQL, or Builder for scheduled Slack/Sheets reports.
