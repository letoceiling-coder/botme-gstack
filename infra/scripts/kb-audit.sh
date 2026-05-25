#!/usr/bin/env bash
# Production-safe KB integrity audit (read-only SQL checks).
# Usage: ./infra/scripts/kb-audit.sh [workspace_id] [kb_id]
set -euo pipefail

SERVER="${DEPLOY_SERVER:-root@212.67.9.173}"
SSH_KEY="${DEPLOY_SSH_KEY:-$HOME/.ssh/id_ed25519_beget}"
WORKSPACE_ID="${1:-}"
KB_ID="${2:-}"

run_sql() {
  local sql="$1"
  ssh -i "$SSH_KEY" "$SERVER" \
    "cd /var/www/agent.neeklo.ru && set -a && source .env && set +a && DB_URL=\${DATABASE_URL%%\\?*} && psql \"\$DB_URL\" -v ON_ERROR_STOP=1 -c $(printf '%q' "$sql")"
}

echo "==> KB Integrity Audit ($(date -u +%Y-%m-%dT%H:%M:%SZ))"

KB_FILTER=""
WS_FILTER=""
[[ -n "$KB_ID" ]] && KB_FILTER="AND c.\"knowledgeBaseId\" = '$KB_ID'"
[[ -n "$WORKSPACE_ID" ]] && WS_FILTER="AND c.\"workspaceId\" = '$WORKSPACE_ID'"

echo "--- Orphan chunks (no active document)"
run_sql "SELECT COUNT(*) AS orphan_chunks FROM kb_chunks c LEFT JOIN kb_documents d ON d.id = c.\"documentId\" WHERE (d.id IS NULL OR d.\"deletedAt\" IS NOT NULL) $KB_FILTER $WS_FILTER;"

echo "--- Chunks missing embeddings"
run_sql "SELECT COUNT(*) AS missing_embeddings FROM kb_chunks WHERE \"hasEmbedding\" = false ${KB_ID:+AND \"knowledgeBaseId\" = '$KB_ID'} ${WORKSPACE_ID:+AND \"workspaceId\" = '$WORKSPACE_ID'};"

echo "--- INDEXED docs with unembedded chunks"
run_sql "SELECT COUNT(*) AS indexed_partial FROM kb_documents d WHERE d.\"deletedAt\" IS NULL AND d.status = 'INDEXED' AND EXISTS (SELECT 1 FROM kb_chunks c WHERE c.\"documentId\" = d.id AND c.\"hasEmbedding\" = false) ${KB_ID:+AND d.\"knowledgeBaseId\" = '$KB_ID'};"

echo "--- Stuck documents (>30min in pipeline)"
run_sql "SELECT status, COUNT(*) FROM kb_documents WHERE \"deletedAt\" IS NULL AND status IN ('PARSING','CHUNKING','EMBEDDING','QUEUED','UPLOADED') AND \"updatedAt\" < NOW() - INTERVAL '30 minutes' ${KB_ID:+AND \"knowledgeBaseId\" = '$KB_ID'} GROUP BY status;"

echo "--- Cross-workspace reference violations"
run_sql "SELECT COUNT(*) AS cross_workspace FROM kb_chunks c INNER JOIN kb_documents d ON d.id = c.\"documentId\" WHERE c.\"workspaceId\" != d.\"workspaceId\";"

echo "--- KB counter drift sample"
run_sql "SELECT kb.id, kb.\"chunkCount\" AS stored_chunks, (SELECT COUNT(*) FROM kb_chunks c WHERE c.\"knowledgeBaseId\" = kb.id) AS actual_chunks, kb.\"documentCount\" AS stored_docs, (SELECT COUNT(*) FROM kb_documents d WHERE d.\"knowledgeBaseId\" = kb.id AND d.\"deletedAt\" IS NULL AND d.status = 'INDEXED') AS actual_docs FROM knowledge_bases kb WHERE kb.\"deletedAt\" IS NULL LIMIT 10;"

echo "==> Audit complete (read-only)"
