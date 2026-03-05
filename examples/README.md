# Example Workflows

Verified n8n workflow JSON outputs from the AI builder.

## UC-Tested (March 2026)

| File | UC | Department | Description |
|------|----|-----------|-------------|
| uc1_payment_gateway_fee.json | UC1 | Finance | Zuora vs Admin payment gateway fee comparison |
| uc2_jira_zendesk_digest.json | UC2 | CX | Jira Accounting issues + Zendesk tickets daily report |
| uc3_sf_health_alert.json | UC3 | CS | Salesforce native node health score alert |

## Other Examples

| File | Description |
|------|-------------|
| bq_enrichment_docs.json | BigQuery enrichment to Google Docs |
| gsheet_slack.json | Google Sheets to Slack |
| monday_slack.json | Monday.com to Slack |

## Importing into n8n

1. Open your n8n instance
2. Create a new workflow
3. Paste the JSON from any file above
4. Configure credentials (names in the JSON match the n8n instance)
5. Activate the workflow
