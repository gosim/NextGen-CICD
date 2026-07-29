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
echo "   Achtung: Required Reviewers brauchen im Free-Plan ein PUBLIC Repo."

echo "── GitHub Pages für Testreports (Branch gh-pages)…"
if ! gh api "repos/$REPO/pages" >/dev/null 2>&1; then
  gh api --method POST "repos/$REPO/pages" \
    -f 'source[branch]=gh-pages' -f 'source[path]=/' >/dev/null 2>&1 \
    && echo "✅ Pages aktiviert." \
    || echo "⚠️  Pages nicht aktivierbar — existiert der gh-pages-Branch schon? (Wird beim ersten Gate-Lauf angelegt; dieses Skript danach erneut ausführen.)"
else
  echo "✅ Pages bereits aktiv."
fi

if [ "${1:-}" = "runner" ]; then
  RUNNER_DIR="$HOME/actions-runner"
  if [ -f "$RUNNER_DIR/.runner" ]; then
    echo "── Runner bereits konfiguriert ($RUNNER_DIR) — überspringe Installation."
  else
    echo "── Installiere self-hosted Runner nach ${RUNNER_DIR}…"
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
    # Minimaler PATH für Runner-Jobs: OHNE die docker-credential-* Helper.
    # Sonst erzwingt Docker den macOS-Keychain, der im LaunchAgent-Kontext
    # nicht zugreifbar ist ("User interaction is not allowed"). Die Workflows
    # nutzen stattdessen ein eigenes DOCKER_CONFIG mit Klartext-Auth (Job-Token).
    mkdir -p "$HOME/deployments/runnerbin"
    ln -sf /Applications/Docker.app/Contents/Resources/bin/docker "$HOME/deployments/runnerbin/docker"
    echo "$HOME/deployments/runnerbin:/usr/bin:/bin:/usr/sbin:/sbin" > .path
    ./svc.sh install
    ./svc.sh start
    echo "✅ Runner 'nextgen-mac' läuft als Dienst (Labels: self-hosted, macOS, ARM64, deploy)."
  fi
fi

echo ""
echo "Fertig. Kontrolle: https://github.com/$REPO/settings/environments"
