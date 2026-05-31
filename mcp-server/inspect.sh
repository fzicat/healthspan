#!/usr/bin/env bash
cd "$(dirname "$0")" && HOST=0.0.0.0 ALLOWED_ORIGINS="http://localhost:6274,http://127.0.0.1:6274,http://$(ip route get 1.1.1.1 | awk '{for(i=1;i<=NF;i++) if($i=="src") print $(i+1)}'):6274" exec npx @modelcontextprotocol/inspector tsx src/index.ts
