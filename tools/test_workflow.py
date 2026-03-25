#!/usr/bin/env python3
"""
End-to-end test harness for the n8n workflow builder chat UI.

Sends a 2-turn conversation (prompt -> confirm), extracts the workflow JSON
from the response, and runs audit checks.

Usage:
    # Single test with inline params
    python tools/test_workflow.py \
        --base-url http://localhost:3004 \
        --department cs \
        --prompt "Create a daily workflow that queries Salesforce..." \
        --expected-creds '{"salesforceOAuth2Api":"aBjJNGRAjYF66z5F"}' \
        --save-to /tmp/test_output.json

    # Or pipe prompt from stdin
    echo "Create a workflow..." | python tools/test_workflow.py \
        --base-url http://localhost:3004 --department cs --prompt -
"""
import argparse
import json
import re
import sys
import time
from typing import Optional
from urllib.request import Request, urlopen
from urllib.error import URLError

# Import the audit module from the same directory
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
from audit_workflow import audit, print_results


def parse_sse_stream(response) -> list:
    """Parse SSE stream from chat API. Returns list of parsed event dicts."""
    events = []
    buffer = ""
    for chunk in response:
        text = chunk.decode("utf-8", errors="replace")
        buffer += text
        # Process all complete SSE events (delimited by double newline)
        while "\n\n" in buffer:
            event_str, buffer = buffer.split("\n\n", 1)
            _parse_event_lines(event_str, events)
    # Handle remaining buffer (final event may not end with \n\n)
    if buffer.strip():
        _parse_event_lines(buffer, events)
    return events


def _parse_event_lines(event_str: str, events: list) -> None:
    """Extract and parse all 'data: ' lines from an SSE event string."""
    for line in event_str.split("\n"):
        line = line.strip()
        if line.startswith("data: "):
            data = line[6:]
            if data == "[DONE]":
                continue
            try:
                events.append(json.loads(data))
            except json.JSONDecodeError:
                pass


def send_message(base_url: str, message: str, department: str,
                 conversation_id: Optional[str] = None) -> tuple:
    """
    Send a message to the chat API.
    Returns (full_text, conversation_id, tool_calls).
    """
    url = f"{base_url}/api/chat"
    body = {"message": message, "departmentId": department}
    if conversation_id:
        body["conversationId"] = conversation_id

    req = Request(
        url,
        data=json.dumps(body).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    try:
        with urlopen(req, timeout=180) as resp:
            events = parse_sse_stream(resp)
    except URLError as e:
        print(f"ERROR: Could not connect to {url}: {e}")
        sys.exit(2)

    full_text = ""
    conv_id = conversation_id
    tool_calls = []

    for ev in events:
        if ev.get("type") == "text_chunk":
            full_text += ev.get("text", "") or ev.get("content", "")
        elif ev.get("type") == "tool_call":
            tool_calls.append(ev.get("name", "") or ev.get("tool", "unknown"))
        elif ev.get("type") == "done":
            conv_id = ev.get("conversationId", conv_id)

    return full_text, conv_id, tool_calls


def extract_workflow_json(text: str) -> Optional[dict]:
    """Extract workflow JSON from a code block in the response text."""
    # Try ```json ... ``` blocks first
    json_blocks = re.findall(r"```json\s*\n(.*?)```", text, re.DOTALL)
    for block in json_blocks:
        try:
            wf = json.loads(block)
            if "nodes" in wf:
                return wf
        except json.JSONDecodeError:
            continue

    # Try ``` ... ``` blocks (no language tag)
    code_blocks = re.findall(r"```\s*\n(.*?)```", text, re.DOTALL)
    for block in code_blocks:
        try:
            wf = json.loads(block)
            if "nodes" in wf:
                return wf
        except json.JSONDecodeError:
            continue

    return None


def check_phase2_gate(text: str) -> bool:
    """Check if the response appears to be a Phase 2 data validation (not final JSON)."""
    has_json = extract_workflow_json(text) is not None
    # Phase 2 typically shows SQL/SOQL and asks for confirmation
    has_sql = "SELECT" in text.upper() or "SOQL" in text.upper()
    has_confirm = any(w in text.lower() for w in [
        "look right", "look good", "confirm", "before i build",
        "does this", "shall i", "ready to build",
    ])
    # If there's no JSON and it asks for confirmation, Phase 2 gate held
    return not has_json and (has_sql or has_confirm)


def run_test(base_url: str, department: str, prompt: str,
             confirm_message: str, expected_creds: Optional[dict],
             save_to: Optional[str], verbose: bool,
             checks: Optional[list] = None) -> bool:
    """
    Run a full 2-turn test. Returns True if all checks pass.
    """
    print(f"\n{'='*60}")
    print(f"TEST: {department} department")
    print(f"{'='*60}")

    # --- Turn 1: Send the prompt ---
    print("\n[Turn 1] Sending prompt...")
    t0 = time.time()
    text1, conv_id, tools1 = send_message(base_url, prompt, department)
    t1 = time.time()
    print(f"  Response: {len(text1)} chars in {t1-t0:.1f}s")
    print(f"  Tools called: {tools1}")
    print(f"  Conversation ID: {conv_id}")

    if verbose:
        print(f"\n  --- Turn 1 Response (first 500 chars) ---")
        print(f"  {text1[:500]}")
        print(f"  ---")

    # Check Phase 2 gate
    phase2_held = check_phase2_gate(text1)
    print(f"\n  Phase 2 gate held: {phase2_held}")

    if not phase2_held:
        # Check if it actually already returned JSON (skipped Phase 2)
        wf = extract_workflow_json(text1)
        if wf:
            print("  WARNING: Phase 2 gate was NOT held - JSON returned in Turn 1")
            print("  Proceeding with audit of Turn 1 JSON...")
        else:
            print("  WARNING: Phase 2 unclear - no JSON and no clear confirmation request")
            print("  Sending confirm message anyway...")

    # --- Turn 2: Confirm ---
    if not extract_workflow_json(text1):
        print(f"\n[Turn 2] Sending: '{confirm_message}'")
        t0 = time.time()
        text2, conv_id, tools2 = send_message(
            base_url, confirm_message, department, conv_id
        )
        t1 = time.time()
        print(f"  Response: {len(text2)} chars in {t1-t0:.1f}s")
        print(f"  Tools called: {tools2}")
        final_text = text2
    else:
        final_text = text1

    # --- Extract JSON ---
    wf = extract_workflow_json(final_text)
    if not wf:
        print("\n  FAIL: No workflow JSON found in response")
        if verbose:
            print(f"\n  --- Full Response (last 1000 chars) ---")
            print(f"  {final_text[-1000:]}")
        return False

    print(f"\n  Workflow extracted: '{wf.get('name', 'unnamed')}'")
    print(f"  Nodes: {len(wf.get('nodes', []))}")
    for n in wf.get("nodes", []):
        print(f"    - {n['name']} ({n['type']})")

    # --- Save JSON ---
    if save_to:
        with open(save_to, "w") as f:
            json.dump(wf, f, indent=2)
        print(f"\n  Saved to: {save_to}")

    # --- Audit ---
    # Write to temp file for audit (audit expects a file path)
    import tempfile
    with tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False) as tmp:
        json.dump(wf, tmp, indent=2)
        tmp_path = tmp.name

    results = audit(tmp_path, expected_creds)

    # Filter results to only checks specified in the test case
    if checks:
        # Map check categories to result key prefixes
        check_prefixes = {
            'encoding': ['encoding'],
            'uuids': ['uuids'],
            'credentials': ['cred:', 'cred_missing:'],
            'bq_projectId': ['bq_projectId:'],
            'bq_query': ['bq_query:'],
            'sf_config': ['sf_config:', 'sf_cred_type:'],
            'slack_config': ['slack_config:'],
            'no_code_nodes': ['no_code_nodes'],
            'jira_ids': ['jira_ids'],
            'future_dates': ['future_dates'],
        }
        allowed_prefixes = []
        for c in checks:
            allowed_prefixes.extend(check_prefixes.get(c, [c]))

        filtered = {}
        for key, val in results.items():
            if any(key == p or key.startswith(p) for p in allowed_prefixes):
                filtered[key] = val
            elif not val[0]:
                # Show non-matching failures as warnings, not counted as failures
                filtered[f"(warn) {key}"] = (True, f"[WARN] {val[1]}")
        results = filtered

    all_pass = print_results(results, f"[{department}] {wf.get('name', 'unnamed')}")

    # Clean up temp file
    import os
    os.unlink(tmp_path)

    return all_pass


def main():
    parser = argparse.ArgumentParser(
        description="End-to-end test for n8n workflow builder"
    )
    parser.add_argument("--base-url", default="http://localhost:3004",
                        help="Chat UI base URL (default: http://localhost:3004)")
    parser.add_argument("--department", required=True,
                        help="Department ID (cs, cx, finance, marketing, ob, payments)")
    parser.add_argument("--prompt", required=True,
                        help="The workflow prompt to send (use '-' to read from stdin)")
    parser.add_argument("--confirm", default="Looks good, build it",
                        help="Confirmation message for Turn 2")
    parser.add_argument("--expected-creds", type=str, default=None,
                        help='Expected credentials JSON: \'{"slackApi":"abc123"}\'')
    parser.add_argument("--save-to", type=str, default=None,
                        help="Save extracted workflow JSON to this path")
    parser.add_argument("--verbose", "-v", action="store_true",
                        help="Show full response text")
    args = parser.parse_args()

    prompt = sys.stdin.read() if args.prompt == "-" else args.prompt
    expected = json.loads(args.expected_creds) if args.expected_creds else None

    success = run_test(
        base_url=args.base_url,
        department=args.department,
        prompt=prompt,
        confirm_message=args.confirm,
        expected_creds=expected,
        save_to=args.save_to,
        verbose=args.verbose,
    )
    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()
