#!/usr/bin/env bash
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
HOOK="$ROOT/.git/hooks/post-merge"
cat > "$HOOK" <<'HOOKEOF'
#!/usr/bin/env bash
set -e
ROOT="$(git rev-parse --show-toplevel)"
"$ROOT/scripts/deploy-ec2.sh"
HOOKEOF
chmod +x "$HOOK"
echo "Installed post-merge hook. Future git pulls will install dependencies and reload PM2."
