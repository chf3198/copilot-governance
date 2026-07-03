#!/usr/bin/env bash
# fleet-discover.sh — Phase 2 F6 (#1042).
# Scans operator's Tailscale tailnet; produces ~/.megingjord/devices.json overlay.
# Operator-portable: works on any tailnet, no hardcoded device assumptions.
set -euo pipefail

out_file="${HOME}/.megingjord/devices.json"
mkdir -p "$(dirname "$out_file")"

if ! command -v tailscale >/dev/null; then
  echo "❌ tailscale not installed — see https://tailscale.com/download"
  exit 1
fi

if ! tailscale status --json >/dev/null 2>&1; then
  echo "⚠ tailscale not authenticated. Run: tailscale up"
  exit 1
fi

echo "▶ scanning tailnet..."
status_json=$(tailscale status --json 2>/dev/null || sudo tailscale status --json)

# Build device records from Self + Peers using jq.
if ! command -v jq >/dev/null; then
  echo "❌ jq required (apt install jq / brew install jq)"
  exit 1
fi

jq -n --argjson st "$status_json" '
  {
    discoveredAt: now | todate,
    devices: (
      [
        ($st.Self | {
          id: (.HostName | ascii_downcase),
          hostname: .HostName,
          dnsName: .DNSName,
          tailscaleIPs: .TailscaleIPs,
          os: .OS,
          local: true,
          online: true,
          tags: .Tags
        })
      ] +
      ($st.Peer // {} | to_entries | map(.value | {
        id: (.HostName | ascii_downcase),
        hostname: .HostName,
        dnsName: .DNSName,
        tailscaleIPs: .TailscaleIPs,
        os: .OS,
        local: false,
        online: .Online,
        tags: .Tags
      }))
    )
  }
' > "$out_file"

count=$(jq '.devices | length' "$out_file")
echo "✅ discovered $count device(s) → $out_file"
echo "   review the overlay; fleet-config.js reads it before inventory/devices.json."
