# ─── Stage 1: Build ───────────────────────────────────────────────────────────
# Build context is the repo root (set in docker-compose.yml / deploy script).
FROM node:22-alpine AS builder
WORKDIR /app

# Install dependencies (paths relative to repo root)
COPY chat-ui/package.json chat-ui/package-lock.json* ./
RUN npm ci

# Copy chat-ui source
COPY chat-ui/ .

# Bake knowledge files into image for Cloud Run (no volume mounts available)
COPY n8n-skills/skills ./knowledge/skills
COPY specs ./knowledge/specs

RUN npm run build

# ─── Stage 2: Production runner ───────────────────────────────────────────────
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8080
ENV HOSTNAME=0.0.0.0

# Non-root user for security
RUN addgroup --system --gid 1001 nodejs \
 && adduser  --system --uid 1001 nextjs

# Copy standalone build output
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static    ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public          ./public
# Copy knowledge files (not included in standalone output)
COPY --from=builder --chown=nextjs:nodejs /app/knowledge       ./knowledge

USER nextjs

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/api/conversations || exit 1

CMD ["node", "server.js"]
