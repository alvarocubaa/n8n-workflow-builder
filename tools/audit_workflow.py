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
    for node in nodes:
        creds = node.get("credentials", {})
        for ctype, cdata in creds.items():
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
            else:
                results[f"cred:{label}"] = (True, f"{cname} ({cid})")

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

    # --- 5. Salesforce node config ---
    for node in nodes:
        if "salesforce" in node.get("type", "").lower():
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

    # --- 7. jira_ids precision ---
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
