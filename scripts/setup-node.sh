#!/usr/bin/env bash
# setup-node.sh — Pin this project to Node.js v22 LTS via nvm.
#
# What it does:
#   1. Installs nvm if not present
#   2. Installs Node v22 LTS and makes it the nvm default
#   3. Writes .nvmrc so `nvm use` auto-selects v22 in this project
#   4. Rebuilds better-sqlite3 (native module) for the new Node version
#   5. Updates the systemd service files to point at the nvm-managed node
#   6. Reloads systemd and restarts newloteca.service
#   7. Runs verify-runtime.sh and npm test to confirm everything is aligned
#
# Safe to re-run — all steps are idempotent.

set -euo pipefail

# ── Config ────────────────────────────────────────────────────────────────────
NVM_INSTALL_VERSION="v0.40.3"
NODE_MAJOR="22"
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
SERVICES_DIR="$HOME/.config/systemd/user"
OLD_NODE_DIR="$HOME/.hermes/node/bin"   # what the service files currently reference

# ── Helpers ───────────────────────────────────────────────────────────────────
info() { printf '  → %s\n' "$*"; }
ok()   { printf '  ✓ %s\n' "$*"; }
warn() { printf '  ! %s\n' "$*"; }
die()  { printf '\nERROR: %s\n' "$*" >&2; exit 1; }
step() { printf '\n── %s\n' "$*"; }

# ── Step 1: Install nvm ───────────────────────────────────────────────────────
step "nvm"
if [ -f "$NVM_DIR/nvm.sh" ]; then
  ok "nvm already installed at $NVM_DIR"
else
  command -v curl >/dev/null 2>&1 || die "curl is required to install nvm"
  info "Downloading and installing nvm $NVM_INSTALL_VERSION..."
  curl -fsSL "https://raw.githubusercontent.com/nvm-sh/nvm/$NVM_INSTALL_VERSION/install.sh" | bash
  ok "nvm installed"
fi

# shellcheck source=/dev/null
source "$NVM_DIR/nvm.sh"

# ── Step 2: Install Node v22 LTS ──────────────────────────────────────────────
step "Node.js $NODE_MAJOR LTS"
nvm install "$NODE_MAJOR"
nvm alias default "$NODE_MAJOR"   # make v22 the default for new shells
nvm use "$NODE_MAJOR"

NVM_NODE_BIN="$(nvm which "$NODE_MAJOR")"   # full path: .../bin/node
NVM_NODE_DIR="$(dirname "$NVM_NODE_BIN")"   # bin directory: .../bin
NODE_VER="$(node --version)"
ok "Active: $NODE_VER  ($NVM_NODE_BIN)"

# ── Step 3: Write .nvmrc ──────────────────────────────────────────────────────
step ".nvmrc"
echo "$NODE_MAJOR" > "$PROJECT_DIR/.nvmrc"
ok "Wrote $PROJECT_DIR/.nvmrc → $NODE_MAJOR"

# ── Step 4: Rebuild native modules ────────────────────────────────────────────
step "Native modules"
cd "$PROJECT_DIR"
info "npm rebuild  (recompiles better-sqlite3 for $NODE_VER)..."
npm rebuild
ok "better-sqlite3 rebuilt"

# ── Step 5: Update systemd service files ──────────────────────────────────────
step "Systemd service files"

update_service() {
  local file="$1"
  if [ ! -f "$file" ]; then
    warn "Not found, skipping: $file"
    return
  fi
  if ! grep -qF "$OLD_NODE_DIR" "$file"; then
    ok "Already up to date: $(basename "$file")"
    return
  fi
  # Replace every occurrence of the old node bin dir with the nvm one.
  # Using | as delimiter so the / in paths don't need escaping.
  sed -i "s|$OLD_NODE_DIR|$NVM_NODE_DIR|g" "$file"
  ok "Updated: $(basename "$file")"
}

update_service "$SERVICES_DIR/newloteca.service"
update_service "$SERVICES_DIR/loteca-checker.service"

# ── Step 6: Reload systemd and restart the web service ────────────────────────
step "Services"
systemctl --user daemon-reload
info "Restarting newloteca.service..."
systemctl --user restart newloteca.service
sleep 2   # give it a moment to start
systemctl --user is-active newloteca.service >/dev/null \
  && ok "newloteca.service is running" \
  || { warn "newloteca.service did not come up — check: journalctl --user -u newloteca.service -n 30 --no-pager"; exit 1; }

# ── Step 7: Verify runtime alignment ──────────────────────────────────────────
step "Runtime verification"
info "verify-runtime.sh..."
"$PROJECT_DIR/scripts/verify-runtime.sh"

step "Tests"
info "npm test..."
npm test

# ── Done ──────────────────────────────────────────────────────────────────────
printf '\n✓ All done. Node %s is now used by tests, the web service, and the checker.\n' "$NODE_VER"
printf '  nvm default is set to %s — new terminals will pick it up automatically.\n' "$NODE_MAJOR"
