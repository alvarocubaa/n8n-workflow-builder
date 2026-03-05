# Testing & Developer Tools

Scripts for testing and auditing n8n workflow builder output.

## Quick Start

```bash
# Install dependency (only needed for run_regression.py)
pip3 install pyyaml

# Audit an existing workflow JSON
python tools/audit_workflow.py /tmp/workflow.json
python tools/audit_workflow.py /tmp/workflow.json --expected-creds '{"slackApi":"abc123"}'

# Run a single end-to-end test
python tools/test_workflow.py \
    --department cs \
    --prompt "Create a daily workflow that queries Salesforce..." \
    --expected-creds '{"salesforceOAuth2Api":"aBjJNGRAjYF66z5F","slackApi":"7H6auF31TpX7Wk7M"}' \
    --save-to /tmp/uc3_output.json

# Run all regression tests
python tools/run_regression.py

# Run a single regression case
python tools/run_regression.py --case uc3_cs

# Save regression outputs
python tools/run_regression.py --save-dir /tmp/regression_results
```

## Scripts

### audit_workflow.py
Standalone JSON audit. Checks:
- **encoding**: ASCII-only in node names, descriptions, and Code node jsCode
- **uuids**: Proper UUID v4 format, unique prefixes (not sequential)
- **credentials**: Presence of ID, optional validation against expected IDs
- **bq_projectId**: BigQuery projectId must be plain string (not object)
- **sf_config**: Salesforce resource="search", operation="query", salesforceOAuth2Api cred type
- **slack_config**: select="channel", channelId with mode="name"
- **jira_ids**: Prefers SPLIT (SQL) or split+includes (JS) over LIKE/indexOf

### test_workflow.py
Full 2-turn end-to-end test against the running chat UI:
1. Sends the prompt (Turn 1)
2. Verifies Phase 2 gate held (data validation shown, no JSON yet)
3. Sends confirmation (Turn 2)
4. Extracts workflow JSON from response
5. Runs audit checks
6. Optionally saves the workflow JSON

Requires the chat UI to be running (`docker-compose up -d`).

### run_regression.py
Batch runner for all test cases defined in `test_cases.yaml`. Runs each case sequentially and produces a summary. Requires PyYAML (`pip3 install pyyaml`).

### test_cases.yaml
Defines the regression test suite. Each case specifies:
- `department`: which department context to use
- `prompt`: the workflow request
- `expected_creds`: credential IDs to verify
- `checks`: which audit checks to run

## Prerequisites

- Python 3.9+
- Chat UI running on localhost:3004 (for test_workflow.py and run_regression.py)
- PyYAML (for run_regression.py only): `pip3 install pyyaml`
