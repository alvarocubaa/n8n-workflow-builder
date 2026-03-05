#!/usr/bin/env python3
"""Fetch Vapi call data (transcript, messages, analysis, cost).

Usage:
    python3 tools/fetch_vapi_call.py --last 1          # Most recent call
    python3 tools/fetch_vapi_call.py --last 5           # Last 5 calls (summary)
    python3 tools/fetch_vapi_call.py --call-id <id>     # Specific call
    python3 tools/fetch_vapi_call.py --call-id <id> --raw  # Full raw JSON

Output: JSON to stdout.
"""

import argparse
import json
import os
import subprocess
import sys
from datetime import datetime
from pathlib import Path

# Load .env from project root
ENV_PATH = Path(__file__).resolve().parent.parent / ".env"
try:
    from dotenv import load_dotenv
    load_dotenv(ENV_PATH)
except ImportError:
    # Manual fallback: parse KEY=VALUE lines
    if ENV_PATH.exists():
        for line in ENV_PATH.read_text().splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                os.environ.setdefault(k.strip(), v.strip())

API_KEY = os.environ.get("VAPI_API_KEY", "")
BASE_URL = "https://api.vapi.ai"


def api_get(path, params=None):
    """Make authenticated GET request to Vapi API using curl (urllib blocked by Cloudflare)."""
    url = f"{BASE_URL}{path}"
    if params:
        qs = "&".join(f"{k}={v}" for k, v in params.items() if v is not None)
        if qs:
            url += f"?{qs}"
    result = subprocess.run(
        ["curl", "-s", "-w", "\n%{http_code}", url, "-H", f"Authorization: Bearer {API_KEY}"],
        capture_output=True, text=True, timeout=30,
    )
    lines = result.stdout.strip().rsplit("\n", 1)
    body = lines[0] if len(lines) > 1 else result.stdout
    status = lines[1] if len(lines) > 1 else "0"
    if not status.startswith("2"):
        print(json.dumps({"error": f"HTTP {status}", "detail": body[:500]}), file=sys.stderr)
        sys.exit(1)
    return json.loads(body)


def extract_tool_calls(messages):
    """Extract tool calls and their results from the messages array."""
    tool_calls = []
    # Build a map of tool-call-id -> result
    results_map = {}
    for msg in messages:
        if msg.get("role") == "tool_call_result":
            tc_id = msg.get("toolCallId", "")
            results_map[tc_id] = msg

    for msg in messages:
        # Vapi uses role="tool_calls" with toolCalls array
        if msg.get("role") == "tool_calls" or msg.get("type") == "tool-calls":
            calls = msg.get("toolCalls", msg.get("toolCallList", []))
            for tc in calls:
                tc_id = tc.get("id", "")
                func = tc.get("function", {})
                result_msg = results_map.get(tc_id, {})
                # Arguments may be a JSON string or dict
                args = func.get("arguments", {})
                if isinstance(args, str):
                    try:
                        args = json.loads(args)
                    except (json.JSONDecodeError, TypeError):
                        pass
                tool_calls.append({
                    "id": tc_id,
                    "name": func.get("name", ""),
                    "arguments": args,
                    "result": result_msg.get("result", result_msg.get("content", "")),
                    "timestamp": msg.get("time", ""),
                    "result_timestamp": result_msg.get("time", ""),
                    "seconds_from_start": msg.get("secondsFromStart", 0),
                    "result_seconds_from_start": result_msg.get("secondsFromStart", 0),
                    "latency_seconds": (result_msg.get("secondsFromStart", 0) - msg.get("secondsFromStart", 0))
                        if result_msg.get("secondsFromStart") else None,
                })
    return tool_calls


def format_transcript(messages):
    """Build a readable transcript from messages array."""
    lines = []
    for msg in messages:
        role = msg.get("role", "")
        content = msg.get("content", msg.get("message", ""))
        if role == "assistant" and content:
            lines.append(f"Assistant: {content}")
        elif role == "user" and content:
            lines.append(f"User: {content}")
        elif msg.get("type") == "tool-calls":
            calls = msg.get("toolCalls", msg.get("toolCallList", []))
            for tc in calls:
                func = tc.get("function", {})
                lines.append(f"[Tool Call: {func.get('name', '')}({json.dumps(func.get('arguments', {}))})]")
        elif role == "tool_call_result" or msg.get("type") == "tool-call-result":
            result = msg.get("result", msg.get("content", ""))
            if isinstance(result, str) and len(result) > 200:
                result = result[:200] + "..."
            lines.append(f"[Tool Result: {result}]")
    return "\n".join(lines)


def parse_call(call_data, raw=False):
    """Parse a single call into structured output."""
    if raw:
        return call_data

    messages = call_data.get("messages", call_data.get("artifact", {}).get("messages", []))
    transcript = call_data.get("artifact", {}).get("transcript", "")
    analysis = call_data.get("analysis", {})

    # Calculate duration
    started = call_data.get("startedAt", "")
    ended = call_data.get("endedAt", "")
    duration_s = None
    if started and ended:
        try:
            t1 = datetime.fromisoformat(started.replace("Z", "+00:00"))
            t2 = datetime.fromisoformat(ended.replace("Z", "+00:00"))
            duration_s = (t2 - t1).total_seconds()
        except (ValueError, TypeError):
            pass

    return {
        "id": call_data.get("id", ""),
        "status": call_data.get("status", ""),
        "type": call_data.get("type", ""),
        "startedAt": started,
        "endedAt": ended,
        "duration_seconds": duration_s,
        "endedReason": call_data.get("endedReason", ""),
        "assistant_name": call_data.get("assistant", {}).get("name", ""),
        "transcript": transcript or format_transcript(messages),
        "tool_calls": extract_tool_calls(messages),
        "analysis": {
            "summary": analysis.get("summary", ""),
            "successEvaluation": analysis.get("successEvaluation", ""),
            "structuredData": analysis.get("structuredData", {}),
        },
        "cost": call_data.get("cost", None),
        "costs": call_data.get("costs", []),
        "recording_url": call_data.get("artifact", {}).get("recordingUrl", ""),
        "messages_count": len(messages),
    }


def main():
    parser = argparse.ArgumentParser(description="Fetch Vapi call data")
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--call-id", help="Specific call ID to fetch")
    group.add_argument("--last", type=int, help="Fetch last N calls")
    parser.add_argument("--raw", action="store_true", help="Output full raw JSON")
    parser.add_argument("--save", help="Save output to file path")
    args = parser.parse_args()

    if not API_KEY:
        print(json.dumps({"error": "VAPI_API_KEY not set in .env"}), file=sys.stderr)
        sys.exit(1)

    if args.call_id:
        data = api_get(f"/call/{args.call_id}")
        result = parse_call(data, raw=args.raw)
    else:
        data = api_get("/call", {"limit": str(args.last)})
        # Vapi returns a list directly
        calls = data if isinstance(data, list) else data.get("calls", data.get("data", []))
        if args.last == 1 and calls:
            # Fetch full details for the single call
            full = api_get(f"/call/{calls[0]['id']}")
            result = parse_call(full, raw=args.raw)
        else:
            result = [parse_call(c, raw=args.raw) for c in calls]

    output = json.dumps(result, indent=2, default=str)

    if args.save:
        Path(args.save).write_text(output)
        print(f"Saved to {args.save}", file=sys.stderr)

    print(output)


if __name__ == "__main__":
    main()
