# Plan: Production Release Changelog (RELEASES.md)

## Problem
No structured record of what changes went into each Cloud Run deploy. If a deploy causes regressions, we can't quickly identify the root cause without manually diffing git commits.

## Solution
Create `RELEASES.md` at project root -- a versioned changelog updated before each production deploy.

### Entry format
```markdown
## v0.XX -- YYYY-MM-DD (revision name)
### Changes
- Bullet list of user-facing or behavior changes

### Prompt changes
- Any system prompt, department config, or spec modifications

### Git range
<previous-commit>..<deploy-commit>

### Test results
- Which test cases were run and their pass/fail status
```

### Implementation steps
1. Reconstruct history from git log (14 commits) into initial RELEASES.md
2. Map Cloud Run revisions to git commits where possible
3. Add a pre-deploy step to `deploy-cloudrun.sh` that:
   - Prompts for version bump (patch/minor)
   - Appends a new entry template to RELEASES.md
   - Creates a git tag `v0.XX`
4. Add regression test baseline: run `python3 tools/run_regression.py` before each deploy, record results in the release entry

### Version numbering
- Start at v0.15 (matching current Cloud Run revision count)
- Minor bump for prompt/logic changes that affect output quality
- Patch bump for UI-only or infra changes

### Benefits
- Quick root cause identification when regressions occur
- Team visibility into what changed between deploys
- Audit trail for prompt engineering decisions
- Git tags enable instant rollback via `git checkout v0.XX`
