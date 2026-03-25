#!/usr/bin/env python3
"""
Run all regression test cases defined in test_cases.yaml.

Usage:
    python tools/run_regression.py                              # all cases
    python tools/run_regression.py --case uc1_finance           # single case
    python tools/run_regression.py --base-url http://host:3004  # custom URL
    python tools/run_regression.py --save-dir /tmp/regression   # save outputs
"""
import argparse
import json
import os
import sys
import time
from pathlib import Path

# PyYAML may not be installed — fall back to a simple parser if needed
try:
    import yaml
except ImportError:
    yaml = None

sys.path.insert(0, str(Path(__file__).parent))
from test_workflow import run_test


def load_yaml_simple(path: str) -> dict:
    """Minimal YAML-like loader for test_cases.yaml if PyYAML is unavailable."""
    # This only handles the specific structure of our test_cases.yaml
    # For full YAML support, install PyYAML: pip install pyyaml
    raise ImportError(
        "PyYAML is required for run_regression.py.\n"
        "Install it with: pip3 install pyyaml"
    )


def load_cases(yaml_path: str) -> list:
    """Load test cases from YAML file."""
    with open(yaml_path) as f:
        if yaml:
            data = yaml.safe_load(f)
        else:
            load_yaml_simple(yaml_path)
            return []  # unreachable

    return data.get("cases", [])


def main():
    parser = argparse.ArgumentParser(description="Run regression tests")
    parser.add_argument("--base-url", default="http://localhost:3004",
                        help="Chat UI base URL")
    parser.add_argument("--case", type=str, default=None,
                        help="Run only this test case (by name)")
    parser.add_argument("--save-dir", type=str, default=None,
                        help="Directory to save workflow JSON outputs")
    parser.add_argument("--verbose", "-v", action="store_true")
    parser.add_argument("--cases-file", type=str,
                        default=str(Path(__file__).parent / "test_cases.yaml"),
                        help="Path to test cases YAML")
    args = parser.parse_args()

    cases = load_cases(args.cases_file)
    if not cases:
        print("ERROR: No test cases found")
        sys.exit(2)

    if args.case:
        cases = [c for c in cases if c["name"] == args.case]
        if not cases:
            print(f"ERROR: No test case named '{args.case}'")
            sys.exit(2)

    if args.save_dir:
        os.makedirs(args.save_dir, exist_ok=True)

    print(f"\n{'#'*60}")
    print(f"REGRESSION SUITE: {len(cases)} test case(s)")
    print(f"Base URL: {args.base_url}")
    print(f"{'#'*60}")

    results = {}
    total_start = time.time()

    for case in cases:
        name = case["name"]
        print(f"\n\n{'*'*60}")
        print(f"CASE: {name} - {case.get('description', '')}")
        print(f"{'*'*60}")

        save_to = None
        if args.save_dir:
            save_to = os.path.join(args.save_dir, f"{name}.json")

        expected_creds = case.get("expected_creds")

        try:
            passed = run_test(
                base_url=args.base_url,
                department=case["department"],
                prompt=case["prompt"],
                confirm_message=case.get("confirm_message", "Looks good, build it"),
                expected_creds=expected_creds,
                save_to=save_to,
                verbose=args.verbose,
                checks=case.get("checks"),
            )
            results[name] = "PASS" if passed else "FAIL"
        except Exception as e:
            print(f"\n  ERROR: {e}")
            results[name] = f"ERROR: {e}"

    total_elapsed = time.time() - total_start

    # --- Summary ---
    print(f"\n\n{'#'*60}")
    print(f"REGRESSION RESULTS")
    print(f"{'#'*60}")

    pass_count = sum(1 for v in results.values() if v == "PASS")
    fail_count = sum(1 for v in results.values() if v == "FAIL")
    error_count = sum(1 for v in results.values() if v.startswith("ERROR"))

    for name, result in results.items():
        icon = "PASS" if result == "PASS" else "FAIL" if result == "FAIL" else "ERR "
        print(f"  [{icon}] {name}: {result}")

    print(f"\n  Total: {pass_count} passed, {fail_count} failed, {error_count} errors")
    print(f"  Elapsed: {total_elapsed:.0f}s")

    if args.save_dir:
        # Save summary
        summary_path = os.path.join(args.save_dir, "summary.json")
        with open(summary_path, "w") as f:
            json.dump({
                "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                "results": results,
                "elapsed_seconds": round(total_elapsed, 1),
            }, f, indent=2)
        print(f"  Summary saved to: {summary_path}")

    all_pass = fail_count == 0 and error_count == 0
    sys.exit(0 if all_pass else 1)


if __name__ == "__main__":
    main()
