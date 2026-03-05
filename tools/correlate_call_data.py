#!/usr/bin/env python3
"""Correlate Vapi call data with n8n executions and produce a diagnostic report.

Usage:
    python3 tools/correlate_call_data.py --vapi-file /tmp/vapi.json --n8n-file /tmp/n8n.json
    python3 tools/correlate_call_data.py --vapi-file /tmp/vapi.json --n8n-file /tmp/n8n.json --airtable-file /tmp/at.json

Output: Markdown report to stdout.
"""

import argparse
import json
import sys
from datetime import datetime
from pathlib import Path


def load_json(path):
    return json.loads(Path(path).read_text())


def fmt_time(iso_str):
    """Format ISO timestamp to readable form."""
    if not iso_str:
        return "—"
    try:
        t = datetime.fromisoformat(iso_str.replace("Z", "+00:00"))
        return t.strftime("%Y-%m-%d %H:%M:%S UTC")
    except (ValueError, TypeError):
        return iso_str


def fmt_duration(seconds):
    """Format seconds to human-readable duration."""
    if seconds is None:
        return "—"
    if seconds < 60:
        return f"{seconds:.1f}s"
    mins = int(seconds // 60)
    secs = seconds % 60
    return f"{mins}m {secs:.0f}s"


def relative_time(call_start_iso, event_iso):
    """Calculate offset from call start in mm:ss format."""
    if not call_start_iso or not event_iso:
        return "—"
    try:
        t0 = datetime.fromisoformat(call_start_iso.replace("Z", "+00:00"))
        t1 = datetime.fromisoformat(event_iso.replace("Z", "+00:00"))
        delta = (t1 - t0).total_seconds()
        if delta < 0:
            return f"-{abs(delta):.0f}s"
        mins = int(delta // 60)
        secs = int(delta % 60)
        return f"{mins:02d}:{secs:02d}"
    except (ValueError, TypeError):
        return "—"


def correlate_tool_calls_to_executions(vapi_data, n8n_data):
    """Match Vapi tool calls to n8n executions by name and timestamp."""
    tool_calls = vapi_data.get("tool_calls", [])
    correlations = []

    for tc in tool_calls:
        match = None
        tc_name = tc.get("name", "").lower().replace("_", "").replace("-", "")

        # Try matching by workflow name containing the tool name (normalized)
        for ex in n8n_data:
            wf_name = ex.get("workflowName", "").lower().replace("_", "").replace("-", "").replace(" ", "").replace(":", "")
            if tc_name in wf_name:
                match = ex
                break

        # Fallback: match by closest timestamp (tool call timestamp is epoch ms)
        if not match and tc.get("timestamp"):
            try:
                tc_epoch = tc["timestamp"]
                if isinstance(tc_epoch, (int, float)):
                    tc_time = datetime.utcfromtimestamp(tc_epoch / 1000)
                else:
                    tc_time = datetime.fromisoformat(str(tc_epoch).replace("Z", "+00:00"))
                best_delta = float("inf")
                for ex in n8n_data:
                    ex_start = ex.get("startedAt", "")
                    if not ex_start:
                        continue
                    ex_time = datetime.fromisoformat(ex_start.replace("Z", "+00:00")).replace(tzinfo=None)
                    delta = abs((ex_time - tc_time).total_seconds())
                    if delta < best_delta and delta < 15:  # within 15s
                        best_delta = delta
                        match = ex
            except (ValueError, TypeError):
                pass

        correlations.append({
            "tool_call": tc,
            "execution": match,
        })

    return correlations


def classify_issues(vapi_data, n8n_data, correlations):
    """Identify issues from the call data."""
    issues = {"CRITICAL": [], "WARNING": [], "INFO": []}

    # Check call end reason
    ended = vapi_data.get("endedReason", "")
    normal_ends = {"customer-ended-call", "assistant-ended-call", "customer-did-not-speak",
                   "assistant-forwarded-call", "silence-timed-out"}
    if ended and ended not in normal_ends:
        issues["CRITICAL"].append({
            "code": "ABNORMAL_CALL_END",
            "signal": f"Call ended with reason: {ended}",
            "cause": "Pipeline error, timeout, or configuration issue",
            "fix": f"Check Vapi dashboard for call {vapi_data.get('id', '')} error details. "
                   f"Common causes: invalid assistant config, LLM provider error, webhook timeout.",
        })

    # Check call duration
    duration = vapi_data.get("duration_seconds")
    if duration is not None and duration < 10:
        issues["WARNING"].append({
            "code": "SHORT_CALL",
            "signal": f"Call lasted only {duration:.1f}s",
            "cause": "May indicate connection issue, invalid config, or immediate hangup",
            "fix": "Check if the assistant greeting was delivered. Review Vapi call recording.",
        })

    # Check for failed n8n executions
    for ex in n8n_data:
        if ex.get("status") == "error":
            error_details = ""
            for node in ex.get("nodes", []):
                if node.get("error"):
                    error_details = f"Node '{node['node']}': {node['error'].get('message', '')}"
                    break
            issues["CRITICAL"].append({
                "code": "N8N_EXECUTION_FAILED",
                "signal": f"Workflow '{ex.get('workflowName', '')}' execution {ex.get('id', '')} failed",
                "cause": error_details or "Unknown error",
                "fix": f"Check n8n execution {ex.get('id', '')} for details. Fix the failing node and re-test.",
            })

    # Check for uncorrelated tool calls (tool fired but no n8n execution found)
    for corr in correlations:
        if corr["tool_call"] and not corr["execution"]:
            tc = corr["tool_call"]
            issues["WARNING"].append({
                "code": "TOOL_CALL_NO_EXECUTION",
                "signal": f"Tool '{tc.get('name', '')}' was called but no matching n8n execution found",
                "cause": "n8n webhook may not have fired, or execution was too fast/out of time window",
                "fix": "Check that the webhook URL in Vapi tool config matches the active n8n workflow path.",
            })

    # Check tool call latency
    for corr in correlations:
        ex = corr.get("execution")
        if ex and ex.get("duration_seconds") is not None:
            if ex["duration_seconds"] > 3:
                issues["WARNING"].append({
                    "code": "SLOW_TOOL_RESPONSE",
                    "signal": f"Tool '{corr['tool_call'].get('name', '')}' took {ex['duration_seconds']:.1f}s",
                    "cause": "n8n workflow execution slow (API calls, DB queries)",
                    "fix": "Optimize the n8n workflow: reduce nodes, parallelize API calls, add caching.",
                })

    # Cost note
    cost = vapi_data.get("cost")
    if cost is not None and cost > 0.50:
        issues["INFO"].append({
            "code": "HIGH_COST",
            "signal": f"Call cost ${cost:.2f} (above $0.50 threshold)",
            "cause": "Long duration, many tool calls, or expensive model",
            "fix": "Review cost breakdown. Consider cheaper STT/TTS or reducing unnecessary tool calls.",
        })

    return issues


def generate_report(vapi_data, n8n_data, correlations, issues, airtable_data=None):
    """Generate the markdown diagnostic report."""
    lines = []

    # Header
    lines.append(f"## Call Review: {vapi_data.get('id', 'unknown')}")
    lines.append(f"**Date**: {fmt_time(vapi_data.get('startedAt'))} | "
                 f"**Duration**: {fmt_duration(vapi_data.get('duration_seconds'))} | "
                 f"**Status**: {vapi_data.get('status', '?')} | "
                 f"**Ended**: {vapi_data.get('endedReason', '?')}")
    if vapi_data.get("cost") is not None:
        lines.append(f"**Cost**: ${vapi_data['cost']:.4f}")
    lines.append("")

    # Timeline
    lines.append("### Timeline")
    lines.append("| Time | Event | Details |")
    lines.append("|------|-------|---------|")
    call_start = vapi_data.get("startedAt", "")
    lines.append(f"| {relative_time(call_start, call_start)} | Call started | {vapi_data.get('type', 'unknown')} |")

    for tc in vapi_data.get("tool_calls", []):
        sfs = tc.get("seconds_from_start", 0)
        mins = int(sfs // 60)
        secs = int(sfs % 60)
        t = f"{mins:02d}:{secs:02d}"
        args_str = json.dumps(tc.get("arguments", {}), default=str)
        if len(args_str) > 80:
            args_str = args_str[:80] + "..."
        lines.append(f"| {t} | Tool: {tc.get('name', '')} | {args_str} |")
        rsfs = tc.get("result_seconds_from_start", 0)
        rmins = int(rsfs // 60)
        rsecs = int(rsfs % 60)
        t2 = f"{rmins:02d}:{rsecs:02d}"
        latency = tc.get("latency_seconds")
        latency_str = f" ({latency:.1f}s)" if latency else ""
        result_preview = str(tc.get("result", ""))[:80]
        if result_preview:
            lines.append(f"| {t2} | Tool result{latency_str} | {result_preview}{'...' if len(str(tc.get('result', ''))) > 80 else ''} |")

    lines.append(f"| {relative_time(call_start, vapi_data.get('endedAt', ''))} | Call ended | {vapi_data.get('endedReason', '')} |")
    lines.append("")

    # Transcript
    transcript = vapi_data.get("transcript", "")
    if transcript:
        lines.append("### Transcript")
        lines.append("```")
        # Limit transcript to first 2000 chars for readability
        if len(transcript) > 2000:
            lines.append(transcript[:2000] + "\n... (truncated)")
        else:
            lines.append(transcript)
        lines.append("```")
        lines.append("")

    # n8n Executions
    if n8n_data:
        lines.append("### n8n Executions")
        lines.append("| # | Workflow | Status | Duration | Started |")
        lines.append("|---|----------|--------|----------|---------|")
        for ex in n8n_data:
            status_icon = "OK" if ex.get("status") == "success" else "FAIL" if ex.get("status") == "error" else ex.get("status", "?")
            lines.append(
                f"| {ex.get('id', '')} | {ex.get('workflowName', '')} | {status_icon} | "
                f"{fmt_duration(ex.get('duration_seconds'))} | {fmt_time(ex.get('startedAt'))} |"
            )
        lines.append("")

        # Error details
        for ex in n8n_data:
            if ex.get("status") == "error" and ex.get("nodes"):
                lines.append(f"#### Execution {ex.get('id', '')} — ERROR Details")
                for node in ex["nodes"]:
                    if node.get("error"):
                        lines.append(f"**Failed Node**: {node['node']}")
                        lines.append(f"**Error**: {node['error'].get('message', 'Unknown')}")
                        if node.get("output_preview"):
                            lines.append(f"**Last Output**: `{node['output_preview'][0] if node['output_preview'] else '—'}`")
                        lines.append("")

    # Airtable Verification
    if airtable_data:
        lines.append("### Airtable Verification")
        lines.append("| Table | Records Found | Details |")
        lines.append("|-------|--------------|---------|")
        for table_name, records in airtable_data.items():
            count = len(records) if isinstance(records, list) else 0
            preview = json.dumps(records[0], default=str)[:80] if records else "—"
            lines.append(f"| {table_name} | {count} | {preview} |")
        lines.append("")

    # Issues
    has_issues = any(v for v in issues.values())
    if has_issues:
        lines.append("### Issues Found")
        lines.append("")
        for severity in ["CRITICAL", "WARNING", "INFO"]:
            for issue in issues.get(severity, []):
                lines.append(f"**{severity}** — `{issue['code']}`")
                lines.append(f"- Signal: {issue['signal']}")
                lines.append(f"- Cause: {issue['cause']}")
                lines.append(f"- Fix: {issue['fix']}")
                lines.append("")
    else:
        lines.append("### Issues Found")
        lines.append("No issues detected.")
        lines.append("")

    # Summary
    lines.append("### Summary")
    critical_count = len(issues.get("CRITICAL", []))
    warning_count = len(issues.get("WARNING", []))
    failed_execs = sum(1 for ex in n8n_data if ex.get("status") == "error")
    total_execs = len(n8n_data)

    if critical_count > 0:
        verdict = f"ISSUES FOUND — {critical_count} critical, {warning_count} warnings"
    elif warning_count > 0:
        verdict = f"MOSTLY OK — {warning_count} warnings to review"
    else:
        verdict = "ALL CLEAR — Call completed successfully with no issues detected"

    lines.append(f"- **Overall**: {verdict}")
    lines.append(f"- **Vapi**: Call {vapi_data.get('status', '?')}, "
                 f"ended: {vapi_data.get('endedReason', '?')}, "
                 f"{len(vapi_data.get('tool_calls', []))} tool calls")
    lines.append(f"- **n8n**: {total_execs} executions, "
                 f"{total_execs - failed_execs} succeeded, {failed_execs} failed")

    analysis_summary = vapi_data.get("analysis", {}).get("summary", "")
    if analysis_summary:
        lines.append(f"- **AI Summary**: {analysis_summary}")

    return "\n".join(lines)


def main():
    parser = argparse.ArgumentParser(description="Correlate Vapi + n8n data into a diagnostic report")
    parser.add_argument("--vapi-file", required=True, help="Path to Vapi call JSON")
    parser.add_argument("--n8n-file", required=True, help="Path to n8n executions JSON")
    parser.add_argument("--airtable-file", help="Path to Airtable records JSON (optional)")
    parser.add_argument("--save", help="Save report to file")
    args = parser.parse_args()

    vapi_data = load_json(args.vapi_file)
    n8n_data = load_json(args.n8n_file)
    airtable_data = load_json(args.airtable_file) if args.airtable_file else None

    # Handle case where n8n_data is a list
    if not isinstance(n8n_data, list):
        n8n_data = [n8n_data]

    # Correlate
    correlations = correlate_tool_calls_to_executions(vapi_data, n8n_data)

    # Classify issues
    issues = classify_issues(vapi_data, n8n_data, correlations)

    # Generate report
    report = generate_report(vapi_data, n8n_data, correlations, issues, airtable_data)

    if args.save:
        Path(args.save).write_text(report)
        print(f"Saved report to {args.save}", file=sys.stderr)

    print(report)


if __name__ == "__main__":
    main()
