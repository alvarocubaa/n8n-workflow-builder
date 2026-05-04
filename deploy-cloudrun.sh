#!/bin/bash
# deploy-cloudrun.sh - Deploy n8n-mcp and chat-ui to Google Cloud Run
# Usage:
#   ./deploy-cloudrun.sh                  # Deploy both services
#   ./deploy-cloudrun.sh --setup-secrets  # Configure/update secrets first
#   ./deploy-cloudrun.sh --mcp-only       # Deploy only n8n-mcp
#   ./deploy-cloudrun.sh --ui-only        # Deploy only chat-ui (most common)

set -e

# ─── Configuration ────────────────────────────────────────────────────────────
PROJECT_ID="${GCP_PROJECT_ID:-agentic-workflows-485210}"
REGION="${GCP_REGION:-europe-west1}"
AR_REPO="europe-west1-docker.pkg.dev/${PROJECT_ID}/cloud-run-source-deploy"

# n8n-mcp service (existing — updated in place)
MCP_SERVICE_NAME="n8n-mcp-cloud"
MCP_IMAGE="${AR_REPO}/${MCP_SERVICE_NAME}:latest"

# chat-ui service
CHAT_SERVICE_NAME="n8n-chat-ui"
CHAT_IMAGE="${AR_REPO}/${CHAT_SERVICE_NAME}:latest"

# Colors
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
log_info()  { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn()  { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# ─── Prerequisites ────────────────────────────────────────────────────────────
check_prerequisites() {
    log_info "Checking prerequisites..."
    if ! command -v gcloud &> /dev/null; then
        log_error "gcloud CLI is not installed — https://cloud.google.com/sdk/docs/install"
        exit 1
    fi
    log_info "Project: $PROJECT_ID   Region: $REGION"
}

# ─── Secrets ─────────────────────────────────────────────────────────────────
setup_secrets() {
    log_info "Setting up secrets in Secret Manager..."
    [ ! -f ".env" ] && log_error ".env not found" && exit 1
    source .env

    upsert_secret() {
        local name=$1 value=$2
        if gcloud secrets describe "$name" --project=$PROJECT_ID &>/dev/null; then
            log_info "Updating secret: $name"
            echo -n "$value" | gcloud secrets versions add "$name" --data-file=- --project=$PROJECT_ID
        else
            log_info "Creating secret: $name"
            echo -n "$value" | gcloud secrets create "$name" --data-file=- --project=$PROJECT_ID
        fi
    }

    upsert_secret "AUTH_TOKEN"  "$AUTH_TOKEN"
    upsert_secret "N8N_API_KEY" "$N8N_API_KEY"

    log_info "Secrets configured!"
}

# ─── n8n-mcp ─────────────────────────────────────────────────────────────────
build_and_push_mcp() {
    log_info "Building n8n-mcp..."
    # Generate temp cloudbuild config with BuildKit enabled
    # (required for --mount=type=cache in n8n-mcp Dockerfile)
    local tmp_cfg; tmp_cfg=$(mktemp /tmp/cloudbuild-mcp-XXXXXX.yaml)
    cat > "$tmp_cfg" <<CBEOF
steps:
  - name: 'gcr.io/cloud-builders/docker'
    env: ['DOCKER_BUILDKIT=1']
    args: ['build', '-t', '${MCP_IMAGE}', '.']
    dir: 'n8n-mcp'
images: ['${MCP_IMAGE}']
options:
  machineType: 'E2_HIGHCPU_8'
CBEOF
    gcloud builds submit . --config="$tmp_cfg" --project=$PROJECT_ID
    rm -f "$tmp_cfg"
    log_info "n8n-mcp image: $MCP_IMAGE"
}

deploy_mcp() {
    log_info "Deploying n8n-mcp..."
    source .env

    # internal ingress — only callable from Cloud Run services in the same project
    # N8N_API_URL sourced from existing N8N_URL secret
    gcloud run deploy "$MCP_SERVICE_NAME" \
        --image "$MCP_IMAGE" \
        --platform managed \
        --region "$REGION" \
        --project "$PROJECT_ID" \
        --service-account "n8n-workflow-builder@${PROJECT_ID}.iam.gserviceaccount.com" \
        --ingress internal \
        --port 8080 \
        --memory 512Mi \
        --cpu 1 \
        --min-instances 0 \
        --max-instances 3 \
        --set-secrets="AUTH_TOKEN=AUTH_TOKEN:latest,N8N_API_KEY=N8N_API_KEY:latest,N8N_API_URL=N8N_URL:latest" \
        --set-env-vars="MCP_MODE=http,LOG_LEVEL=info,TRUST_PROXY=1,NODE_ENV=production"
    # IAM: n8n-workflow-builder SA already has run.invoker on this service (SA-to-SA auth)

    MCP_URL=$(gcloud run services describe "$MCP_SERVICE_NAME" \
        --region="$REGION" --project="$PROJECT_ID" --format='value(status.url)')
    log_info "n8n-mcp: ${MCP_URL}"
}

# ─── chat-ui ─────────────────────────────────────────────────────────────────
build_and_push_chat_ui() {
    log_info "Building chat-ui..."
    # Build context = repo root (Dockerfile copies n8n-skills/skills and specs)
    # Generate temp cloudbuild config with BuildKit enabled
    local tmp_cfg; tmp_cfg=$(mktemp /tmp/cloudbuild-chat-XXXXXX.yaml)
    cat > "$tmp_cfg" <<CBEOF
steps:
  - name: 'gcr.io/cloud-builders/docker'
    env: ['DOCKER_BUILDKIT=1']
    args: ['build', '-t', '${CHAT_IMAGE}', '-f', 'chat-ui/Dockerfile', '.']
images: ['${CHAT_IMAGE}']
options:
  machineType: 'E2_HIGHCPU_8'
CBEOF
    gcloud builds submit . --config="$tmp_cfg" --project=$PROJECT_ID
    rm -f "$tmp_cfg"
    log_info "chat-ui image: $CHAT_IMAGE"
}

deploy_chat_ui() {
    log_info "Deploying chat-ui..."
    source .env

    # Resolve existing n8n-mcp URL
    MCP_URL=$(gcloud run services describe "$MCP_SERVICE_NAME" \
        --region="$REGION" --project="$PROJECT_ID" \
        --format='value(status.url)' 2>/dev/null || echo "")

    if [ -z "$MCP_URL" ]; then
        log_warn "Could not resolve MCP service URL. Deploy n8n-mcp first."
        MCP_URL="https://REPLACE_WITH_N8N_MCP_URL"
    fi

    gcloud run deploy "$CHAT_SERVICE_NAME" \
        --image "$CHAT_IMAGE" \
        --platform managed \
        --region "$REGION" \
        --project "$PROJECT_ID" \
        --service-account "n8n-workflow-builder@${PROJECT_ID}.iam.gserviceaccount.com" \
        --no-allow-unauthenticated \
        --port 8080 \
        --memory 512Mi \
        --cpu 1 \
        --min-instances 1 \
        --max-instances 15 \
        --set-secrets="N8N_API_KEY=N8N_API_KEY:latest,MCP_AUTH_TOKEN=AUTH_TOKEN:latest,HUB_CALLBACK_SECRET=HUB_CALLBACK_SECRET:latest" \
        --set-env-vars="MCP_SERVICE_URL=${MCP_URL},N8N_API_URL=${N8N_API_URL},NODE_ENV=production,HUB_CALLBACK_URL=https://ilhlkseqwparwdwhzcek.supabase.co/functions/v1,GOOGLE_OAUTH_CLIENT_ID=535171325336-fhsjk06js2dshcg75b7g7gf4mqiv48eh.apps.googleusercontent.com"

    CHAT_URL=$(gcloud run services describe "$CHAT_SERVICE_NAME" \
        --region="$REGION" --project="$PROJECT_ID" --format='value(status.url)')

    echo ""
    log_info "chat-ui deployed!"
    echo ""
    echo "============================================"
    echo "  Chat UI: $CHAT_URL"
    echo "============================================"
    echo ""
    echo "All IAM steps are complete (SA grants, IAP, domain access)."
    echo "Activate the workflow after testing: https://guesty.app.n8n.cloud"
}

# ─── Main ─────────────────────────────────────────────────────────────────────
main() {
    echo "========================================"
    echo "  n8n Builder — Cloud Run Deploy"
    echo "========================================"
    echo ""
    check_prerequisites

    case "$1" in
        --setup-secrets)
            setup_secrets ;;
        --mcp-only)
            build_and_push_mcp
            deploy_mcp ;;
        --ui-only)
            build_and_push_chat_ui
            deploy_chat_ui ;;
        *)
            build_and_push_mcp
            deploy_mcp
            build_and_push_chat_ui
            deploy_chat_ui ;;
    esac
}

main "$@"
