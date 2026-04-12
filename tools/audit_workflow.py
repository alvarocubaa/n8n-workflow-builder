#!/usr/bin/env python3
"""
Audit an n8n workflow JSON file for common issues.

Checks: encoding (ASCII, mojibake), UUID format, credential scoping,
BigQuery projectId, Salesforce node config, Slack config.

Usage:
    python tools/audit_workflow.py /path/to/workflow.json
    python tools/audit_workflow.py /path/to/workflow.json --expected-slack-id RdxjTWVc6DaiNrIY
    python tools/audit_workflow.py /path/to/workflow.json --expected-creds '{"slackApi":"RdxjTWVc6DaiNrIY"}'
"""
import argparse
import json
import re
import sys
from typing import Optional


def audit(wf_path: str, expected_creds: Optional[dict] = None) -> dict:
    """Run all audit checks on a workflow JSON file. Returns {check: (pass, detail)}."""
    with open(wf_path) as f:
        raw = f.read()
        wf = json.loads(raw)

    nodes = wf.get("nodes", [])
    results = {}

    # --- 1. Encoding: ASCII-only in all string values ---
    mojibake = re.findall(r"\\u00e2\\u0080[\\u0080-\\u00bf]", raw)
    non_ascii_names = [n["name"] for n in nodes if any(ord(c) > 127 for c in n.get("name", ""))]
    js_nodes = [n for n in nodes if n.get("parameters", {}).get("jsCode")]
    non_ascii_js = any(any(ord(c) > 127 for c in n["parameters"]["jsCode"]) for n in js_nodes)

    if mojibake or non_ascii_names or non_ascii_js:
        results["encoding"] = (False, f"mojibake={bool(mojibake)}, names={non_ascii_names}, js={non_ascii_js}")
    else:
        results["encoding"] = (True, "All ASCII")

    # --- 2. UUID format + uniqueness ---
    ids = [n.get("id", "") for n in nodes]
    uuid_re = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", re.I)
    all_valid = all(uuid_re.match(nid) for nid in ids)
    prefixes = [nid.rsplit("-", 1)[0] for nid in ids if "-" in nid]
    unique_prefixes = len(set(prefixes))
    simple_ids = [nid for nid in ids if re.match(r"^node-", nid)]

    if simple_ids:
        results["uuids"] = (False, f"Simple IDs: {simple_ids}")
    elif not all_valid:
        results["uuids"] = (False, f"Invalid format in: {[i for i in ids if not uuid_re.match(i)]}")
    elif unique_prefixes < len(ids) and len(ids) > 1:
        results["uuids"] = (False, f"Sequential: only {unique_prefixes}/{len(ids)} unique prefixes")
    else:
        results["uuids"] = (True, f"{len(ids)} unique UUIDs")

    # --- 3. Credentials ---
    all_cred_types_used = set()
    for node in nodes:
        creds = node.get("credentials", {})
        for ctype, cdata in creds.items():
            all_cred_types_used.add(ctype)
            cid = cdata.get("id", "")
            cname = cdata.get("name", "")
            label = f"{node['name']} -> {ctype}"

            if not cid:
                results[f"cred:{label}"] = (False, "Missing credential ID")
            elif expected_creds and ctype in expected_creds:
                if cid == expected_creds[ctype]:
                    results[f"cred:{label}"] = (True, f"{cname} ({cid})")
                else:
                    results[f"cred:{label}"] = (False, f"Expected {expected_creds[ctype]}, got {cid}")
            elif expected_creds and cid not in expected_creds.values():
                results[f"cred:{label}"] = (False, f"Unexpected credential type '{ctype}' with unknown ID {cid}")
            else:
                results[f"cred:{label}"] = (True, f"{cname} ({cid})")

    # Check for expected credential types that are missing entirely
    if expected_creds:
        for etype in expected_creds:
            if etype not in all_cred_types_used:
                results[f"cred_missing:{etype}"] = (False, f"Expected credential type '{etype}' not found in any node")

    # --- 4. BigQuery projectId ---
    for node in nodes:
        if "googleBigQuery" in node.get("type", ""):
            pid = node.get("parameters", {}).get("projectId")
            label = f"bq_projectId:{node['name']}"
            if isinstance(pid, str):
                results[label] = (True, f"Plain string: {pid}")
            elif isinstance(pid, dict):
                results[label] = (False, f"Object format: {pid}")
            else:
                results[label] = (False, "Missing projectId")

    # --- 5. Salesforce node config (skip trigger nodes — they don't have resource/operation) ---
    for node in nodes:
        ntype = node.get("type", "").lower()
        if "salesforce" in ntype and "trigger" not in ntype:
            p = node.get("parameters", {})
            res = p.get("resource", "")
            op = p.get("operation", "")
            label = f"sf_config:{node['name']}"

            if res == "search" and op == "query":
                results[label] = (True, "resource=search, operation=query")
            else:
                results[label] = (False, f"resource={res}, operation={op} (expected search/query)")

            # Check credential type
            creds = node.get("credentials", {})
            if "salesforceOAuth2Api" in creds:
                results[f"sf_cred_type:{node['name']}"] = (True, "salesforceOAuth2Api")
            elif creds:
                results[f"sf_cred_type:{node['name']}"] = (False, f"Wrong type: {list(creds.keys())}")

    # --- 6. Slack config ---
    for node in nodes:
        if "slack" in node.get("type", "").lower():
            p = node.get("parameters", {})
            label = f"slack_config:{node['name']}"
            select = p.get("select", "")
            cid = p.get("channelId", {})

            if select == "channel" and isinstance(cid, dict) and cid.get("mode") == "name":
                results[label] = (True, f"channel: {cid.get('value', '?')}")
            elif select == "channel":
                results[label] = (True, f"channel mode OK")
            else:
                results[label] = (False, f"select={select}, channelId={cid}")

    # --- 7. BigQuery empty SQL query ---
    for node in nodes:
        if "googleBigQuery" in node.get("type", ""):
            sql = node.get("parameters", {}).get("sqlQuery", "").strip()
            label = f"bq_query:{node['name']}"
            if not sql:
                results[label] = (False, "Empty SQL query")
            else:
                results[label] = (True, f"SQL present ({len(sql)} chars)")

    # --- 8. Code node detection (when AI nodes expected) ---
    code_nodes = [n["name"] for n in nodes if n.get("type", "") == "n8n-nodes-base.code"]
    if code_nodes:
        results["no_code_nodes"] = (False, f"Code nodes found: {code_nodes}")
    else:
        results["no_code_nodes"] = (True, "No Code nodes")

    # --- 9. Future date detection ---
    from datetime import datetime, timedelta
    one_year_ahead = (datetime.now() + timedelta(days=365)).strftime("%Y-%m-%d")
    all_text = raw  # scan entire workflow JSON for date literals
    future_dates = re.findall(r"\b(20\d{2}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01]))\b", all_text)
    bad_dates = [d for d in future_dates if d > one_year_ahead]
    if bad_dates:
        results["future_dates"] = (False, f"Dates >1yr in future: {list(set(bad_dates))}")
    elif future_dates:
        results["future_dates"] = (True, f"All dates within range")

    # --- 10. jira_ids precision ---
    all_code = " ".join(
        n.get("parameters", {}).get("sqlQuery", "") + " " + n.get("parameters", {}).get("jsCode", "")
        for n in nodes
    )
    if "jira_ids" in all_code:
        if "SPLIT" in all_code or "UNNEST(SPLIT" in all_code:
            results["jira_ids"] = (True, "Uses SPLIT in SQL")
        elif ".split(" in all_code and ".includes(" in all_code:
            results["jira_ids"] = (True, "Uses split+includes in JS")
        elif "LIKE CONCAT" in all_code or "LIKE '%" in all_code:
            results["jira_ids"] = (False, "Uses LIKE (substring false positives)")
        elif "indexOf" in all_code or ".includes(" in all_code:
            results["jira_ids"] = (False, "Uses indexOf/includes (substring false positives)")
        else:
            results["jira_ids"] = (True, "jira_ids referenced, method unclear")

    # --- 11. CSM lookup: no unnecessary SF round-trip ---
    # Rule: if a BQ query already SELECTs the `csm` column from a CSM-dataset table,
    # the workflow should NOT also call Salesforce to look up account owner — the BQ
    # query already has the answer. This catches the harvested_cs_005 pattern where
    # the AI selected `c.csm` from csm_churn_report AND made a redundant SF call.
    # See specs/02_SRC_CSM_Spec.md "CSM / Account Owner Lookup Rule".
    #
    # We only flag the unambiguous case (BQ already SELECTs csm) — workflows that
    # query SF as their primary source (SF Trigger + SF query) are NOT flagged.
    csm_tables = [
        "guesty_analytics.dim_accounts",
        "csm.portfolio",
        "csm.health_score",
        "csm.csm_churn_report",
        "csm.mrr_calculator",
        "csm.segmentation_report",
    ]
    # Find BQ nodes that both reference a csm-dataset table AND already select csm.
    bq_csm_select_nodes = []
    for n in nodes:
        if "googleBigQuery" not in n.get("type", ""):
            continue
        sql = n.get("parameters", {}).get("sqlQuery", "") or ""
        sql_l = sql.lower()
        if not any(t in sql for t in csm_tables):
            continue
        # Heuristic: SELECT clause references a `csm` column (alias.csm or bare csm
        # in a SELECT list). Avoid false positives from `csm_overall_risk_level`,
        # `csm_request_date`, etc., by requiring word-boundary `csm` immediately
        # followed by `,`, whitespace, end-of-line, or `as`/`AS`.
        if re.search(r"\bcsm\b\s*(?:,|\s|$|as\b)", sql_l, re.MULTILINE):
            bq_csm_select_nodes.append(n["name"])

    sf_query_nodes_with_owner = [
        n["name"] for n in nodes
        if "salesforce" in n.get("type", "").lower()
        and "trigger" not in n.get("type", "").lower()
        and (
            "owner" in str(n.get("parameters", {}).get("query", "")).lower()
            or "owner" in str(n.get("parameters", {}).get("additionalFields", {})).lower()
        )
    ]
    if bq_csm_select_nodes and sf_query_nodes_with_owner:
        results["csm_no_sf_roundtrip"] = (
            False,
            f"BQ query already SELECTs `csm` column ({bq_csm_select_nodes}) AND workflow makes a "
            f"Salesforce owner lookup ({sf_query_nodes_with_owner}). The SF call is redundant — "
            f"use the BQ `csm` column directly. See specs/02_SRC_CSM_Spec.md."
        )
    elif bq_csm_select_nodes:
        results["csm_no_sf_roundtrip"] = (
            True,
            f"BQ query SELECTs csm from {bq_csm_select_nodes}, no redundant SF lookup"
        )

    return results


def print_results(results: dict, wf_path: str) -> bool:
    """Print audit results. Returns True if all passed."""
    passed = sum(1 for ok, _ in results.values() if ok)
    failed = sum(1 for ok, _ in results.values() if not ok)

    print(f"\n{'='*60}")
    print(f"AUDIT: {wf_path}")
    print(f"{'='*60}")

    for check, (ok, detail) in sorted(results.items()):
        status = "PASS" if ok else "FAIL"
        print(f"  [{status}] {check}: {detail}")

    print(f"\n  Total: {passed} passed, {failed} failed")
    return failed == 0


def main():
    parser = argparse.ArgumentParser(description="Audit n8n workflow JSON")
    parser.add_argument("workflow", help="Path to workflow JSON file")
    parser.add_argument("--expected-creds", type=str, default=None,
                        help='Expected credentials as JSON: \'{"slackApi":"abc123"}\'')
    args = parser.parse_args()

    expected = json.loads(args.expected_creds) if args.expected_creds else None
    results = audit(args.workflow, expected)
    all_pass = print_results(results, args.workflow)
    sys.exit(0 if all_pass else 1)


if __name__ == "__main__":
    main()
