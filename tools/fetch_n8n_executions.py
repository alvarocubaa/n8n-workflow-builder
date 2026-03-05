#!/usr/bin/env python3
"""Fetch n8n workflow executions within a time window.

Usage:
    python3 tools/fetch_n8n_executions.py --workflow-ids id1,id2 --start 2026-03-04T18:00:00Z --end 2026-03-04T19:00:00Z
    python3 tools/fetch_n8n_executions.py --workflow-ids id1 --last 5
    python3 tools/fetch_n8n_executions.py --all-recent 10

Output: JSON to stdout with execution summaries.
"""

import argparse
import json
import os
import subprocess
import sys
from datetime import datetime
from pathlib import Path
from urllib.parse import urlencode

# Load .env from project root
ENV_PATH = Path(__file__).resolve().parent.parent / ".env"
try:
    from dotenv import load_dotenv
    load_dotenv(ENV_PATH)
except ImportError:
    if ENV_PATH.exists():
        for line in ENV_PATH.read_text().splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                os.environ.setdefault(k.strip(), v.strip())

API_URL = os.environ.get("N8N_API_URL", "https://guesty.app.n8n.cloud").rstrip("/")
API_KEY = os.environ.get("N8N_API_KEY", "")


def api_get(path, params=None):
    """Make authenticated GET request to n8n REST API using curl."""
    url = f"{API_URL}/api/v1{path}"
    if params:
        qs = urlencode({k: v for k, v in params.items() if v is not None})
        if qs:
            url += f"?{qs}"
    result = subprocess.run(
        ["curl", "-s", "-w", "\n%{http_code}", url, "-H", f"X-N8N-API-KEY: {API_KEY}"],
        capture_output=True, text=True, timeout=30,
    )
    lines = result.stdout.strip().rsplit("\n", 1)
    body = lines[0] if len(lines) > 1 else result.stdout
    status = lines[1] if len(lines) > 1 else "0"
    if not status.startswith("2"):
        print(json.dumps({"error": f"HTTP {status}", "url": url, "detail": body[:500]}), file=sys.stderr)
        return None
    return json.loads(body)


def get_workflow_name(workflow_id, cache={}):
    """Get workflow name by ID (cached)."""
    if workflow_id not in cache:
        data = api_get(f"/workflows/{workflow_id}")
        cache[workflow_id] = data.get("name", workflow_id) if data else workflow_id
    return cache[workflow_id]


def list_executions(workflow_id=None, limit=20, status=None):
    """List executions, optionally filtered by workflow."""
    params = {"limit": str(limit)}
    if workflow_id:
        params["workflowId"] = workflow_id
    if status:
        params["status"] = status
    data = api_get("/executions", params)
    if not data:
        return []
    return data.get("data", data.get("results", []))


def get_execution_detail(exec_id):
    """Get full execution details including node data."""
    data = api_get(f"/executions/{exec_id}", {"includeData": "true"})
    return data


def extract_node_results(execution):
    """Extract per-node results from execution data."""
    run_data = (execution.get("data", {})
                .get("resultData", {})
                .get("runData", {}))
    nodes = []
    for node_name, runs in run_data.items():
        for run in runs:
            items = run.get("data", {}).get("main", [[]])[0] if run.get("data") else []
            error = run.get("error")
            nodes.append({
                "node": node_name,
                "status": "error" if error else "success",
                "items_count": len(items),
                "started": run.get("startTime", ""),
                "duration_ms": run.get("executionTime", 0),
                "error": {
                    "message": error.get("message", "") if error else None,
                    "node": error.get("node", "") if error else None,
                } if error else None,
                "output_preview": _preview_items(items),
            })
    return nodes


def _preview_items(items, max_items=2, max_chars=200):
    """Preview first N items, truncated."""
    previews = []
    for item in items[:max_items]:
        data = item.get("json", {})
        s = json.dumps(data, default=str)
        if len(s) > max_chars:
            s = s[:max_chars] + "..."
        previews.append(s)
    return previews


def parse_execution(execution, include_details=False):
    """Parse execution into structured summary."""
    exec_id = execution.get("id", "")
    workflow_id = execution.get("workflowId", execution.get("workflowData", {}).get("id", ""))
    workflow_name = execution.get("workflowData", {}).get("name", "") or get_workflow_name(workflow_id)

    started = execution.get("startedAt", "")
    stopped = execution.get("stoppedAt", "")
    duration_s = None
    if started and stopped:
        try:
            t1 = datetime.fromisoformat(started.replace("Z", "+00:00"))
            t2 = datetime.fromisoformat(stopped.replace("Z", "+00:00"))
            duration_s = (t2 - t1).total_seconds()
        except (ValueError, TypeError):
            pass

    result = {
        "id": exec_id,
        "workflowId": workflow_id,
        "workflowName": workflow_name,
        "status": execution.get("status", ""),
        "startedAt": started,
        "stoppedAt": stopped,
        "duration_seconds": duration_s,
        "mode": execution.get("mode", ""),
    }

    if include_details:
        result["nodes"] = extract_node_results(execution)

    return result


def filter_by_time(executions, start_iso, end_iso):
    """Filter executions to those within a time window."""
    filtered = []
    for ex in executions:
        ex_start = ex.get("startedAt", "")
        if not ex_start:
            continue
        try:
            t = datetime.fromisoformat(ex_start.replace("Z", "+00:00"))
            t_start = datetime.fromisoformat(start_iso.replace("Z", "+00:00"))
            t_end = datetime.fromisoformat(end_iso.replace("Z", "+00:00"))
            if t_start <= t <= t_end:
                filtered.append(ex)
        except (ValueError, TypeError):
            continue
    return filtered


def main():
    parser = argparse.ArgumentParser(description="Fetch n8n executions")
    parser.add_argument("--workflow-ids", help="Comma-separated workflow IDs")
    parser.add_argument("--start", help="Start time (ISO 8601)")
    parser.add_argument("--end", help="End time (ISO 8601)")
    parser.add_argument("--last", type=int, default=10, help="Fetch last N executions per workflow")
    parser.add_argument("--all-recent", type=int, help="Fetch last N executions across all workflows")
    parser.add_argument("--details", action="store_true", help="Include per-node execution details")
    parser.add_argument("--status", help="Filter by status: success, error, waiting")
    parser.add_argument("--save", help="Save output to file path")
    args = parser.parse_args()

    if not API_KEY:
        print(json.dumps({"error": "N8N_API_KEY not set in .env"}), file=sys.stderr)
        sys.exit(1)

    all_executions = []

    if args.all_recent:
        execs = list_executions(limit=args.all_recent, status=args.status)
        all_executions.extend(execs)
    elif args.workflow_ids:
        for wf_id in args.workflow_ids.split(","):
            wf_id = wf_id.strip()
            execs = list_executions(workflow_id=wf_id, limit=args.last, status=args.status)
            all_executions.extend(execs)
    else:
        print(json.dumps({"error": "Provide --workflow-ids or --all-recent"}), file=sys.stderr)
        sys.exit(1)

    # Filter by time window if provided
    if args.start and args.end:
        all_executions = filter_by_time(all_executions, args.start, args.end)

    # Get details if requested
    results = []
    for ex in all_executions:
        if args.details:
            full = get_execution_detail(ex.get("id", ""))
            if full:
                results.append(parse_execution(full, include_details=True))
            else:
                results.append(parse_execution(ex, include_details=False))
        else:
            results.append(parse_execution(ex, include_details=False))

    # Sort by startedAt
    results.sort(key=lambda x: x.get("startedAt", ""))

    output = json.dumps(results, indent=2, default=str)

    if args.save:
        Path(args.save).write_text(output)
        print(f"Saved to {args.save}", file=sys.stderr)

    print(output)


if __name__ == "__main__":
    main()
