#!/usr/bin/env bash
# n8n Workflow Builder + n8n bundle — access verification.
#
# Run this on YOUR OWN machine, logged in as YOURSELF. It proves you can actually
# reach everything you now own. Read-only: it never mutates anything.
#
#   ./verify-access.sh
#
# Exit 0 = you can reach everything. Non-zero = the number of failed checks.

set -uo pipefail

PROJECT="agentic-workflows-485210"
REGION="europe-west1"
HUB_PROJECT="ai-innovation-484111"
SHARED_SA="n8n-workflow-builder@${PROJECT}.iam.gserviceaccount.com"
DATASET="n8n_ops"

pass=0; fail=0; warn=0
ok()    { printf '  \033[32m✓\033[0m %s\n' "$1"; pass=$((pass+1)); }
no()    { printf '  \033[31m✗\033[0m %s\n' "$1"; [ -n "${2:-}" ] && printf '      → %s\n' "$2"; fail=$((fail+1)); }
warned(){ printf '  \033[33m!\033[0m %s\n' "$1"; [ -n "${2:-}" ] && printf '      → %s\n' "$2"; warn=$((warn+1)); }
hdr()   { printf '\n\033[1m%s\033[0m\n' "$1"; }

printf '\033[1mn8n Workflow Builder + bundle — access verification\033[0m\n'

# ── identity ────────────────────────────────────────────────────────────────
hdr "Identity"
acct=$(gcloud config get-value account 2>/dev/null)
[ -n "$acct" ] && ok "gcloud authenticated as $acct" \
               || no "gcloud not authenticated" "run: gcloud auth login"

gh auth status >/dev/null 2>&1 && ok "gh CLI authenticated as $(gh api user --jq .login 2>/dev/null)" \
                               || no "gh CLI not authenticated" "run: gh auth login"

# ── source ──────────────────────────────────────────────────────────────────
hdr "GitHub repos"
for r in n8n-workflow-builder n8n-ops n8n-mcp-cloud; do
  if gh api "repos/alvarocubaa/$r" >/dev/null 2>&1; then
    perm=$(gh api "repos/alvarocubaa/$r" --jq '.permissions | to_entries | map(select(.value)) | map(.key) | join(",")' 2>/dev/null)
    ok "alvarocubaa/$r reachable (perms: ${perm:-none})"
    case "$perm" in *admin*) : ;; *) warned "$r: not admin yet" "accept the admin invite, or request it" ;; esac
  else
    no "cannot read alvarocubaa/$r" "accept your repo invite (check GitHub notifications)"
  fi
done

gh api repos/kurtpabilona-code/AI-Innovation-Hub-Vertex >/dev/null 2>&1 \
  && ok "the Hub repo is reachable (already yours)" \
  || warned "cannot read the Hub repo" "expected — it is Kurt's; ignore if you are not Kurt"

# Unlanded builder work — flag it until it is landed or deliberately abandoned.
wb_branches=$(gh api repos/alvarocubaa/n8n-workflow-builder/branches --jq '.[].name' 2>/dev/null)
case "$wb_branches" in
  *repo-standardization*) warned "n8n-workflow-builder: 'session/2026-06-26-repo-standardization' unmerged" \
      "11 commits: BI context layer + agent_logs writer — see HANDOVER §7." ;;
esac

# ── runtime ─────────────────────────────────────────────────────────────────
hdr "GCP project ${PROJECT}"
gcloud projects describe "$PROJECT" >/dev/null 2>&1 \
  && ok "can read project $PROJECT" \
  || no "cannot read project $PROJECT" "request roles/editor from Roni Shif (holds projectIamAdmin)"

hdr "Cloud Run services"
for s in n8n-chat-ui n8n-mcp-cloud n8n-ops n8n-kpi-freshness-alarm; do
  if gcloud run services describe "$s" --region "$REGION" --project "$PROJECT" >/dev/null 2>&1; then
    ok "can describe $s"
  else
    no "cannot describe $s" "needs roles/run.admin (or viewer) on $PROJECT"
  fi
done

hdr "Deploy capability"
if gcloud iam service-accounts describe "$SHARED_SA" --project "$PROJECT" >/dev/null 2>&1; then
  ok "can see the shared service account"
  warned "note: $SHARED_SA is shared across ~8 services incl. the Hermes VM" "you need iam.serviceAccountUser on it to deploy"
else
  no "cannot see the shared SA" "you need iam.serviceAccountUser on it or 'gcloud run deploy' will fail"
fi

# ── the 6 schedulers ────────────────────────────────────────────────────────
hdr "Cloud Schedulers (the bundle's heartbeat)"
for j in ingest loop-alerts sweep-zombies sync-hub weekly-digest kpi-rollup; do
  state=$(gcloud scheduler jobs describe "n8n-ops-$j" --location "$REGION" --project "$PROJECT" \
          --format='value(state)' 2>/dev/null)
  if [ -n "$state" ]; then
    [ "$state" = "ENABLED" ] && ok "n8n-ops-$j is $state" \
                             || warned "n8n-ops-$j is $state" "expected ENABLED"
  else
    no "cannot read scheduler n8n-ops-$j" "needs cloudscheduler.admin/viewer on $PROJECT"
  fi
done

# ── data ────────────────────────────────────────────────────────────────────
hdr "BigQuery ${DATASET}"
if bq --project_id="$PROJECT" ls "$DATASET" >/dev/null 2>&1; then
  ok "can list dataset $DATASET"
  fresh=$(bq --project_id="$PROJECT" --format=csv --quiet query --use_legacy_sql=false --nouse_cache \
    "SELECT TIMESTAMP_DIFF(CURRENT_TIMESTAMP(), MAX(started_at), HOUR) FROM \`${PROJECT}.${DATASET}.executions\`" 2>/dev/null | tail -1)
  case "$fresh" in
    ''|*[!0-9]*) warned "could not compute ingest freshness" "needs bigquery.jobUser" ;;
    *) if [ "$fresh" -le 2 ]; then ok "ingest is fresh (last execution ${fresh}h ago)"
       else no "ingest looks stale — last execution ${fresh}h ago" \
               "the 15-min /ingest cron is not landing rows — check the scheduler and the n8n API key"
       fi ;;
  esac
else
  no "cannot list dataset $DATASET" "needs bigquery.dataViewer/jobUser on $PROJECT"
fi

# ── secrets ─────────────────────────────────────────────────────────────────
hdr "Secrets (existence only — values never read)"
for s in n8n-api-key n8n-ops-slack-bot-token supabase-hub-service-role supabase-hub-url; do
  gcloud secrets describe "$s" --project "$PROJECT" >/dev/null 2>&1 \
    && ok "secret $s exists and is visible" \
    || no "cannot see secret $s" "needs secretmanager.viewer/secretAccessor"
done

# ── the Hub side ────────────────────────────────────────────────────────────
hdr "Hub project ${HUB_PROJECT}"
gcloud projects describe "$HUB_PROJECT" >/dev/null 2>&1 \
  && ok "can read $HUB_PROJECT (the Hub app)" \
  || warned "cannot read $HUB_PROJECT" "you should already be editor here — check with Roni"

# ── summary ─────────────────────────────────────────────────────────────────
printf '\n\033[1mResult:\033[0m %d passed, %d failed, %d warnings\n' "$pass" "$fail" "$warn"
if [ "$fail" -eq 0 ]; then
  printf '\033[32mAll access checks passed.\033[0m Handover bar: now ship one real change to each system.\n'
else
  printf '\033[31m%d check(s) failed.\033[0m Send this output over — it is the list of what to grant.\n' "$fail"
fi
exit "$fail"
