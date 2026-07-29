#!/usr/bin/env bash
# Einmaliges GitHub-Setup: Environments + Protection Rules + self-hosted Runner.
# Voraussetzung: `gh auth login` wurde durchgeführt (Scopes: repo, workflow, admin:org nicht nötig).
#   deploy/scripts/setup-github.sh            → Environments einrichten
#   deploy/scripts/setup-github.sh runner     → zusätzlich self-hosted Runner installieren
set -euo pipefail

REPO="$(gh repo view --json nameWithOwner --jq .nameWithOwner)"
USER_ID="$(gh api user --jq .id)"
USER_LOGIN="$(gh api user --jq .login)"

echo "Repo: $REPO — User: $USER_LOGIN ($USER_ID)"

echo "── Environment 'integration' (kein Approval, nur main)…"
gh api --method PUT "repos/$REPO/environments/integration" \
  -F "deployment_branch_policy[protected_branches]=false" \
  -F "deployment_branch_policy[custom_branch_policies]=true" >/dev/null
gh api --method POST "repos/$REPO/environments/integration/deployment-branch-policies" \
  -f name=main >/dev/null 2>&1 || true

for ENV in abnahme prod; do
  echo "── Environment '$ENV' (Required Reviewer: $USER_LOGIN, nur main)…"
  gh api --method PUT "repos/$REPO/environments/$ENV" \
    --input - >/dev/null <<JSON
{
  "reviewers": [{ "type": "User", "id": $USER_ID }],
  "deployment_branch_policy": { "protected_branches": false, "custom_branch_policies": true }
}
JSON
  gh api --method POST "repos/$REPO/environments/$ENV/deployment-branch-policies" \
    -f name=main >/dev/null 2>&1 || true
done

echo "✅ Environments eingerichtet: integration (auto), abnahme + prod (manuelle Freigabe durch $USER_LOGIN)."
echo "   Hinweis: 'Prevent self-review' bewusst NICHT aktiv — Solo-Demo braucht Selbst-Freigabe."

if [ "${1:-}" = "runner" ]; then
  RUNNER_DIR="$HOME/actions-runner"
  if [ -f "$RUNNER_DIR/.runner" ]; then
    echo "── Runner bereits konfiguriert ($RUNNER_DIR) — überspringe Installation."
  else
    echo "── Installiere self-hosted Runner nach $RUNNER_DIR…"
    mkdir -p "$RUNNER_DIR"
    cd "$RUNNER_DIR"
    ARCH="arm64"
    LATEST_URL="$(gh api repos/actions/runner/releases/latest \
      --jq ".assets[] | select(.name | test(\"osx-${ARCH}-[0-9.]+tar.gz$\")) | .browser_download_url")"
    echo "   Lade $LATEST_URL"
    curl -fsSL -o runner.tar.gz "$LATEST_URL"
    tar xzf runner.tar.gz && rm runner.tar.gz
    REG_TOKEN="$(gh api --method POST "repos/$REPO/actions/runners/registration-token" --jq .token)"
    ./config.sh --url "https://github.com/$REPO" --token "$REG_TOKEN" \
      --name "nextgen-mac" --labels deploy --unattended
    ./svc.sh install
    ./svc.sh start
    echo "✅ Runner 'nextgen-mac' läuft als Dienst (Labels: self-hosted, macOS, ARM64, deploy)."
  fi
fi

echo ""
echo "Fertig. Kontrolle: https://github.com/$REPO/settings/environments"
