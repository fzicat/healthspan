#!/usr/bin/env bash
#
# Launch the MCP Inspector for the Healthspan server, reachable from another
# machine on the LAN or over Tailscale. Headless-friendly: it does not try to
# open a browser on this server.
#
# The Inspector prints a URL like:
#     http://localhost:6274/?MCP_PROXY_AUTH_TOKEN=<token>
# From another PC, open it but replace "localhost" with one of the IPs printed
# below, keeping the ?MCP_PROXY_AUTH_TOKEN=... query parameter.
#
cd "$(dirname "$0")" || exit 1

# This server's primary LAN IP (source address of the default route).
lan_ip="$(ip route get 1.1.1.1 2>/dev/null | awk '{for (i=1; i<=NF; i++) if ($i=="src") print $(i+1)}')"

# This server's Tailscale IP, if Tailscale is running (100.64.0.0/10).
ts_ip="$(tailscale ip -4 2>/dev/null | head -n1)"

# Browser origins allowed to talk to the Inspector proxy (CORS). The UI is
# served on port 6274, so the origins use that port.
origins="http://localhost:6274,http://127.0.0.1:6274"
[ -n "$lan_ip" ] && origins="$origins,http://$lan_ip:6274"
[ -n "$ts_ip" ]  && origins="$origins,http://$ts_ip:6274"

echo "MCP Inspector — open from another PC at:"
[ -n "$lan_ip" ] && echo "  http://$lan_ip:6274   (LAN)"
[ -n "$ts_ip" ]  && echo "  http://$ts_ip:6274   (Tailscale)"
echo "Append the ?MCP_PROXY_AUTH_TOKEN=... shown in the URL the Inspector prints below."
echo

HOST=0.0.0.0 \
MCP_AUTO_OPEN_ENABLED=false \
ALLOWED_ORIGINS="$origins" \
exec npx @modelcontextprotocol/inspector tsx src/index.ts
