#!/usr/bin/env python3
"""Test DentalVoice n8n backend by sending Vapi-format webhook payloads.

Usage:
    python3 tools/test_vapi_scenarios.py              # Run all tests
    python3 tools/test_vapi_scenarios.py --test 1     # Run specific test
    python3 tools/test_vapi_scenarios.py --test 1,3,5 # Run multiple tests
    python3 tools/test_vapi_scenarios.py --verbose     # Show full responses

Output: Pass/fail report to stdout.
"""

import argparse
import json
import os
import subprocess
import sys
import time
from datetime import datetime, timedelta
from pathlib import Path

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

WEBHOOK_BASE = os.environ.get("N8N_WEBHOOK_BASE", "https://guesty.app.n8n.cloud/webhook")

# Compute dates relative to today
TODAY = datetime.now().strftime("%Y-%m-%d")
TOMORROW = (datetime.now() + timedelta(days=1)).strftime("%Y-%m-%d")
NEXT_WEEK = (datetime.now() + timedelta(days=7)).strftime("%Y-%m-%d")
NEXT_WEEK_END = (datetime.now() + timedelta(days=11)).strftime("%Y-%m-%d")
PAST_DATE = "2025-01-15"


def vapi_tool_payload(tool_name, arguments, call_id="test-call-001", tool_call_id=None):
    """Build a Vapi-format webhook payload for a tool call."""
    if tool_call_id is None:
        tool_call_id = f"call_{tool_name}_{int(time.time())}"
    return {
        "message": {
            "type": "tool-calls",
            "toolCallList": [{
                "id": tool_call_id,
                "type": "function",
                "function": {
                    "name": tool_name,
                    "arguments": arguments
                }
            }],
            "call": {"id": call_id},
            "timestamp": int(time.time() * 1000)
        }
    }


def vapi_assistant_request_payload(phone_number="+15014644090"):
    """Build a Vapi assistant-request payload."""
    return {
        "message": {
            "type": "assistant-request",
            "call": {
                "id": f"test-call-{int(time.time())}",
                "phoneNumber": {
                    "number": phone_number
                }
            }
        }
    }


def send_webhook(path, payload, timeout=15):
    """Send a POST to the n8n webhook and return (status_code, response_body, elapsed_seconds)."""
    url = f"{WEBHOOK_BASE}/{path}"
    body = json.dumps(payload)
    t0 = time.time()
    try:
        result = subprocess.run(
            ["curl", "-s", "-w", "\n%{http_code}", "-X", "POST", url,
             "-H", "Content-Type: application/json",
             "-d", body],
            capture_output=True, text=True, timeout=timeout
        )
        elapsed = time.time() - t0
        lines = result.stdout.strip().rsplit("\n", 1)
        resp_body = lines[0] if len(lines) > 1 else result.stdout
        status = lines[1] if len(lines) > 1 else "0"
        return int(status), resp_body, elapsed
    except subprocess.TimeoutExpired:
        return 0, "TIMEOUT", time.time() - t0
    except Exception as e:
        return 0, str(e), time.time() - t0


def check_response(status, body, checks):
    """Validate response against a list of check functions. Returns (pass, details)."""
    errors = []
    details = []

    if status < 200 or status >= 300:
        errors.append(f"HTTP {status}")

    try:
        data = json.loads(body)
    except (json.JSONDecodeError, TypeError):
        data = body

    for check_fn, description in checks:
        try:
            result = check_fn(status, data, body)
            if result is True:
                details.append(f"  OK: {description}")
            elif isinstance(result, str):
                details.append(f"  OK: {description} — {result}")
            else:
                errors.append(f"{description}: {result}")
        except Exception as e:
            errors.append(f"{description}: Exception — {e}")

    passed = len(errors) == 0
    return passed, errors, details


# ─── Test Scenarios ───────────────────────────────────────────────────────────

SCENARIOS = []


def scenario(name, webhook_path, payload_fn, checks, description=""):
    """Register a test scenario."""
    SCENARIOS.append({
        "name": name,
        "webhook_path": webhook_path,
        "payload_fn": payload_fn,
        "checks": checks,
        "description": description,
    })


# 1. Assistant Request — should return a full assistant config
scenario(
    name="Assistant Request",
    webhook_path="vapi-assistant-request",
    payload_fn=lambda: vapi_assistant_request_payload("+15014644090"),
    checks=[
        (lambda s, d, b: True if isinstance(d, dict) and "assistant" in d else "Missing 'assistant' key",
         "Response contains assistant config"),
        (lambda s, d, b: True if d.get("assistant", {}).get("model", {}).get("tools") else "No tools found",
         "Assistant has tools defined"),
        (lambda s, d, b: (
            True if any("today" in str(m.get("content", "")).lower() or "context" in str(m.get("content", "")).lower()
                        for m in d.get("assistant", {}).get("model", {}).get("messages", []))
            else "System prompt missing date context"
        ), "System prompt contains current date"),
        (lambda s, d, b: (
            f"Found {len(d.get('assistant', {}).get('model', {}).get('tools', []))} tools"
            if len(d.get("assistant", {}).get("model", {}).get("tools", [])) == 5
            else f"Expected 5 tools, got {len(d.get('assistant', {}).get('model', {}).get('tools', []))}"
        ), "Has 5 tools"),
    ],
    description="Vapi sends assistant-request, expects full config with system prompt and tools",
)

# 2. Lookup existing patient — John Smith
scenario(
    name="Lookup existing patient",
    webhook_path="vapi-lookup-patient",
    payload_fn=lambda: vapi_tool_payload("lookup_patient", {
        "first_name": "John",
        "last_name": "Smith"
    }),
    checks=[
        (lambda s, d, b: True if s == 200 else f"HTTP {s}",
         "HTTP 200"),
        (lambda s, d, b: True if "results" in (d if isinstance(d, dict) else {}) else "Missing 'results' key",
         "Response has results array"),
        (lambda s, d, b: (
            True if isinstance(d, dict) and d.get("results") and
            any("result" in str(r).lower() for r in d.get("results", []))
            else "No result content in response"
        ), "Contains result data"),
    ],
    description="Look up existing patient John Smith",
)

# 3. Lookup non-existent patient — Jane Doe
scenario(
    name="Lookup non-existent patient",
    webhook_path="vapi-lookup-patient",
    payload_fn=lambda: vapi_tool_payload("lookup_patient", {
        "first_name": "Zzznonexistent",
        "last_name": "Doesnotexist"
    }),
    checks=[
        (lambda s, d, b: True if s == 200 else f"HTTP {s}",
         "HTTP 200"),
        (lambda s, d, b: True if "results" in (d if isinstance(d, dict) else {}) else "Missing 'results' key",
         "Response has results array"),
        (lambda s, d, b: (
            True if any("not found" in str(r).lower() or "no patient" in str(r).lower() or "no record" in str(r).lower()
                        for r in (d if isinstance(d, dict) else {}).get("results", [{}]))
            else f"Expected 'not found' message"
        ), "Contains 'not found' message"),
    ],
    description="Look up patient that doesn't exist",
)

# 4. Check slots — next week morning cleaning
scenario(
    name="Check slots - morning cleaning",
    webhook_path="vapi-check-slots",
    payload_fn=lambda: vapi_tool_payload("check_slots", {
        "date_range_start": NEXT_WEEK,
        "date_range_end": NEXT_WEEK_END,
        "appointment_type": "cleaning",
        "time_preference": "morning"
    }),
    checks=[
        (lambda s, d, b: True if s == 200 else f"HTTP {s}",
         "HTTP 200"),
        (lambda s, d, b: True if "results" in (d if isinstance(d, dict) else {}) else "Missing 'results' key",
         "Response has results array"),
        (lambda s, d, b: (
            True if d.get("results") and len(d["results"]) > 0
            else "Empty results"
        ), "Returns at least one result"),
    ],
    description="Search for morning cleaning slots next week",
)

# 5. Check slots — past date (no match)
scenario(
    name="Check slots - past date",
    webhook_path="vapi-check-slots",
    payload_fn=lambda: vapi_tool_payload("check_slots", {
        "date": PAST_DATE,
        "appointment_type": "cleaning"
    }),
    checks=[
        (lambda s, d, b: True if s == 200 else f"HTTP {s}",
         "HTTP 200"),
        (lambda s, d, b: True if "results" in (d if isinstance(d, dict) else {}) else "Missing 'results' key",
         "Response has results array"),
        (lambda s, d, b: (
            True if any("no" in str(r).lower() and ("slot" in str(r).lower() or "available" in str(r).lower())
                        for r in (d if isinstance(d, dict) else {}).get("results", [{}]))
            else "Expected 'no slots available' message"
        ), "Contains 'no slots' message"),
    ],
    description="Search for slots on a past date — should return none",
)

# 6. Check slots — evening preference
scenario(
    name="Check slots - evening",
    webhook_path="vapi-check-slots",
    payload_fn=lambda: vapi_tool_payload("check_slots", {
        "date_range_start": NEXT_WEEK,
        "date_range_end": NEXT_WEEK_END,
        "appointment_type": "exam",
        "time_preference": "evening"
    }),
    checks=[
        (lambda s, d, b: True if s == 200 else f"HTTP {s}",
         "HTTP 200"),
        (lambda s, d, b: True if "results" in (d if isinstance(d, dict) else {}) else "Missing 'results' key",
         "Response has results array"),
    ],
    description="Search for evening exam slots — tests the evening filter fix",
)

# 7. Check slots — next available
scenario(
    name="Check slots - next available",
    webhook_path="vapi-check-slots",
    payload_fn=lambda: vapi_tool_payload("check_slots", {
        "appointment_type": "cleaning",
        "next_available": True
    }),
    checks=[
        (lambda s, d, b: True if s == 200 else f"HTTP {s}",
         "HTTP 200"),
        (lambda s, d, b: True if "results" in (d if isinstance(d, dict) else {}) else "Missing 'results' key",
         "Response has results array"),
    ],
    description="Find the next available cleaning slot",
)

# 8. Book appointment — new patient
scenario(
    name="Book appointment (new patient)",
    webhook_path="vapi-book-appointment",
    payload_fn=lambda: vapi_tool_payload("book_appointment", {
        "patient_first_name": "Test",
        "patient_last_name": "Patient",
        "patient_phone": "+15551234567",
        "appointment_type": "cleaning",
        "date": NEXT_WEEK,
        "time": "09:00",
        "is_new_patient": True,
        "insurance_carrier": "Delta Dental",
        "notes": "Automated test booking"
    }),
    checks=[
        (lambda s, d, b: True if s == 200 else f"HTTP {s}",
         "HTTP 200"),
        (lambda s, d, b: True if "results" in (d if isinstance(d, dict) else {}) else "Missing 'results' key",
         "Response has results array"),
        (lambda s, d, b: (
            True if any("book" in str(r).lower() or "confirm" in str(r).lower() or "scheduled" in str(r).lower()
                        for r in (d if isinstance(d, dict) else {}).get("results", [{}]))
            else "Expected booking confirmation"
        ), "Contains booking confirmation"),
    ],
    description="Book a new patient appointment for next week",
)

# 9. Cancel appointment
scenario(
    name="Cancel appointment",
    webhook_path="vapi-cancel-appointment",
    payload_fn=lambda: vapi_tool_payload("cancel_appointment", {
        "patient_first_name": "Test",
        "patient_last_name": "Patient",
        "appointment_date": NEXT_WEEK,
        "reason": "Testing cancellation"
    }),
    checks=[
        (lambda s, d, b: True if s == 200 else f"HTTP {s}",
         "HTTP 200"),
        (lambda s, d, b: True if "results" in (d if isinstance(d, dict) else {}) else "Missing 'results' key",
         "Response has results array"),
    ],
    description="Cancel the test appointment",
)

# 10. Reschedule appointment
scenario(
    name="Reschedule appointment",
    webhook_path="vapi-reschedule-appointment",
    payload_fn=lambda: vapi_tool_payload("reschedule_appointment", {
        "patient_first_name": "John",
        "patient_last_name": "Smith",
        "original_date": NEXT_WEEK,
        "new_date": (datetime.now() + timedelta(days=14)).strftime("%Y-%m-%d"),
        "new_time": "14:00"
    }),
    checks=[
        (lambda s, d, b: True if s == 200 else f"HTTP {s}",
         "HTTP 200"),
        (lambda s, d, b: True if "results" in (d if isinstance(d, dict) else {}) else "Missing 'results' key",
         "Response has results array"),
    ],
    description="Reschedule John Smith's appointment",
)


# ─── Runner ────────────────────────────────────────────────────────────────────

def run_tests(test_indices=None, verbose=False, save_path=None):
    """Run selected test scenarios and produce a report."""
    if test_indices is None:
        test_indices = list(range(len(SCENARIOS)))

    total = len(test_indices)
    passed = 0
    failed = 0
    results = []

    print(f"\n{'='*55}")
    print(f"  DentalVoice Backend Test Suite")
    print(f"  Date: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"  Webhook: {WEBHOOK_BASE}")
    print(f"  Tests: {total}")
    print(f"{'='*55}\n")

    for i, idx in enumerate(test_indices):
        sc = SCENARIOS[idx]
        label = f"[{i+1}/{total}] {sc['name']}"

        # Build payload
        payload = sc["payload_fn"]()

        # Send
        status, body, elapsed = send_webhook(sc["webhook_path"], payload)

        # Validate
        ok, errors, details = check_response(status, body, sc["checks"])

        if ok:
            passed += 1
            status_str = "PASS"
            # Extract a short summary from details
            summary = ""
            for d in details:
                if "—" in d:
                    summary = d.split("—")[1].strip()
                    break
            suffix = f" — {summary}" if summary else ""
            print(f"  {label} {'.'*(50-len(label))} PASS ({elapsed:.1f}s){suffix}")
        else:
            failed += 1
            status_str = "FAIL"
            error_summary = errors[0] if errors else "Unknown"
            print(f"  {label} {'.'*(50-len(label))} FAIL ({elapsed:.1f}s)")
            print(f"    ERROR: {error_summary}")
            if len(errors) > 1:
                for e in errors[1:]:
                    print(f"    ERROR: {e}")

        if verbose:
            print(f"    Webhook: {sc['webhook_path']}")
            print(f"    Status: HTTP {status}")
            try:
                resp_preview = json.dumps(json.loads(body), indent=2)[:500]
            except (json.JSONDecodeError, TypeError):
                resp_preview = str(body)[:500]
            print(f"    Response: {resp_preview}")
            for d in details:
                print(f"  {d}")
            print()

        results.append({
            "index": idx + 1,
            "name": sc["name"],
            "status": status_str,
            "http_status": status,
            "elapsed": elapsed,
            "errors": errors,
            "response_preview": str(body)[:200],
        })

    print(f"\n{'='*55}")
    print(f"  RESULTS: {passed}/{total} passed, {failed} failed")
    if failed == 0:
        print("  ALL TESTS PASSED!")
    print(f"{'='*55}\n")

    if save_path:
        report = {
            "date": datetime.now().isoformat(),
            "webhook_base": WEBHOOK_BASE,
            "total": total,
            "passed": passed,
            "failed": failed,
            "results": results,
        }
        Path(save_path).write_text(json.dumps(report, indent=2, default=str))
        print(f"Report saved to {save_path}", file=sys.stderr)

    return failed == 0


def main():
    parser = argparse.ArgumentParser(description="Test DentalVoice n8n backend")
    parser.add_argument("--test", help="Run specific test(s) by number, comma-separated (e.g., 1,3,5)")
    parser.add_argument("--verbose", "-v", action="store_true", help="Show full responses")
    parser.add_argument("--save", help="Save JSON report to file")
    parser.add_argument("--list", action="store_true", help="List all test scenarios")
    args = parser.parse_args()

    if args.list:
        print(f"\nAvailable test scenarios ({len(SCENARIOS)} total):\n")
        for i, sc in enumerate(SCENARIOS):
            print(f"  {i+1}. {sc['name']}")
            print(f"     {sc['description']}")
            print(f"     Webhook: {sc['webhook_path']}")
            print()
        return

    test_indices = None
    if args.test:
        test_indices = [int(t.strip()) - 1 for t in args.test.split(",")]
        # Validate
        for idx in test_indices:
            if idx < 0 or idx >= len(SCENARIOS):
                print(f"Error: Test {idx+1} does not exist. Run with --list to see available tests.", file=sys.stderr)
                sys.exit(1)

    success = run_tests(test_indices, verbose=args.verbose, save_path=args.save)
    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()
