#!/usr/bin/env bash
set -euo pipefail

SERVICE_NAME="newloteca.service"

if ! command -v systemctl >/dev/null 2>&1; then
  echo "[verify-runtime] ERROR: systemctl not found" >&2
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo "[verify-runtime] ERROR: node not found in current PATH" >&2
  exit 1
fi

service_show="$(systemctl --user show "$SERVICE_NAME" -p ExecStart || true)"
service_node="$(printf '%s\n' "$service_show" | sed -n 's/^ExecStart=.*path=\([^ ;]*\).*/\1/p')"

if [[ -z "$service_node" ]]; then
  echo "[verify-runtime] ERROR: could not determine service node from: $service_show" >&2
  exit 1
fi

if [[ ! -x "$service_node" ]]; then
  echo "[verify-runtime] ERROR: service node is not executable: $service_node" >&2
  exit 1
fi

env_node="$(command -v node)"
service_node_real="$(readlink -f "$service_node" 2>/dev/null || printf '%s' "$service_node")"
env_node_real="$(readlink -f "$env_node" 2>/dev/null || printf '%s' "$env_node")"

service_ver="$($service_node -v)"
service_abi="$($service_node -p 'process.versions.modules')"
env_ver="$(node -v)"
env_abi="$(node -p 'process.versions.modules')"

echo "[verify-runtime] service node: $service_node_real"
echo "[verify-runtime] service version: $service_ver (ABI $service_abi)"
echo "[verify-runtime] env node: $env_node_real"
echo "[verify-runtime] env version: $env_ver (ABI $env_abi)"

if ! "$service_node" -e "require('better-sqlite3'); console.log('[verify-runtime] better-sqlite3: OK')"; then
  echo "[verify-runtime] ERROR: better-sqlite3 failed to load with service node" >&2
  exit 1
fi

critical=0

if [[ "$service_node_real" != "$env_node_real" ]]; then
  echo "[verify-runtime] ERROR: critical mismatch: service node path differs from current environment node path" >&2
  critical=1
fi

if [[ "$service_abi" != "$env_abi" ]]; then
  echo "[verify-runtime] ERROR: critical mismatch: service ABI ($service_abi) != env ABI ($env_abi)" >&2
  critical=1
fi

if [[ $critical -ne 0 ]]; then
  exit 1
fi

echo "[verify-runtime] runtime check passed"
