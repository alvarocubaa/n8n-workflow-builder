# n8n Credentials Guide

Single source of truth for credential names and IDs in `guesty.app.n8n.cloud`.

**Rule:** Use exact credential names listed below. Never invent names.
When generating workflows that will be deployed to n8n, always use the `id` field so
the credential resolves correctly — name alone is not enough for programmatic deployment.

---

## Common / Shared Credentials (pre-configured in the instance)

| Service | Usage | n8n Credential Name | Credential Type | Credential ID |
|---------|-------|---------------------|-----------------|---------------|
| BigQuery | AI/CX (primary) | Google BigQuery - N8N Service Account | googleApi | `h7fJ82YhtOnUL58u` |
| BigQuery | AI/CX read-only | Google Service Account n8n-ai-cx-read | googleApi | `VQ7CU7dKViVcv8Ah` |
| Salesforce | Production read | Salesforce Production Read | salesforceOAuth2Api | `fCB6gfK7EaGpMnZy` |
| Zendesk | Production (API key) | Zendesk production - info@guesty.com | zendeskApi | `I0sSUZvS0LVHjO2J` |
| Zendesk | Production (OAuth2) | Zendesk Production - Read - OAuth2 Generic | oAuth2Api | `B1ksdYFDJ8LJKaTJ` |
| Zendesk | Sandbox | Zendesk Sandbox - Read and Write - OAuth2 Generic | oAuth2Api | `A7d4a6CBhZl6J7pA` |
| Modjo | API (AI Team) | AI Team - v2 (Modjo) | httpHeaderAuth | `F7aaemlCF4AOev8s` |
| Zuora | Production | zuora | oAuth2Api | `GbVP08J912cXYfH4` |
| HiBob | Service account | HiBob Service Account | httpBasicAuth | `i1wp4rmLyhytsxPj` |
| Slack | CX automations bot | bot_user_oauth_token_slack_app_workflows_builder | slackApi | `g3NQlNzyjFofD87l` |
| Slack | GCS Magic | Slack GCS Magic | slackApi | `5fFTcu6juoVmfxkO` |
| Google Gemini | CX | Google Gemini Guesty n8n CX | googlePalmApi | `JrzPwNiVhZibKlAr` |
| Google Gemini | CSM | Google Gemini Guesty n8n8 CSM | googlePalmApi | `w2UVOXsARkCmAsOu` |
| Google Gemini | Marketing | Google Gemini Guesty n8n Marketing | googlePalmApi | `LL8fLgZSrUn8oZtV` |
| OpenAI | AI Team | AI Team - OpenAI | openAiApi | `sibRkht3HDN1V5lW` |

---

## Per-User Credentials (each user configures their own)

| Service | Examples |
|---------|----------|
| Gmail | Personal Gmail OAuth2 (each person's own) |
| Google Docs | Personal Google Docs OAuth2 |
| Google Sheets | Personal Google Sheets OAuth2 |
| Google Drive | Personal Google Drive OAuth2 |
| Google Calendar | Personal Google Calendar OAuth2 |
| Jira | Personal Jira Software Cloud API (own account) |
| Slack | Personal Slack OAuth2 (if sending as yourself) |

---

## Usage in Workflow JSON

When programmatically creating or updating workflows, set credentials like this:

```json
{
  "credentials": {
    "googleApi": {
      "id": "h7fJ82YhtOnUL58u",
      "name": "Google BigQuery - N8N Service Account"
    }
  }
}
```

Always include **both** `id` and `name`. The `id` is authoritative for resolution.

---

## Choosing Between BigQuery Node and Native Node

| Approach | Use when |
|----------|----------|
| Native node (Salesforce, Zendesk, etc.) | Writing data, triggering on events, or using filtering not available in BigQuery |
| BigQuery node | Read-only reporting/aggregation across multiple sources |

For **Salesforce data** in BigQuery: use `Google BigQuery - N8N Service Account` with `guesty-data.guesty_analytics.*` tables.
For **Zendesk data** in BigQuery: use `Google BigQuery - N8N Service Account` with `guesty-data.zendesk_analytics.*` tables.
