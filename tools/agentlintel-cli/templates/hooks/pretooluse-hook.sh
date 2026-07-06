#!/bin/sh
payload=$(cat)
tool=""
if command -v node >/dev/null 2>&1; then
  tool=$(printf '%s' "$payload" | node -e 'let s="";process.stdin.on("data",d=>s+=d);process.stdin.on("end",()=>{try{const j=JSON.parse(s||"{}");process.stdout.write(String(j.tool_name||j.toolName||j.tool||""));}catch{}});')
fi
case "$tool" in Edit|Write|MultiEdit) ;; *) exit 0;; esac

bin="./node_modules/.bin/agentlintel";
[ -x "$bin" ] || bin=$(command -v agentlintel 2>/dev/null)
[ -n "$bin" ] || exit 0
out=$("$bin" verify --diff --quiet --bail --no-run --skip-fixtures 2>&1); code=$?
case "$out" in *"GATE FAILED"*) [ "$code" -eq 1 ] && { echo "$out" >&2; exit 2; };; esac
[ "$code" -eq 0 ] || echo "agentlintel: exit $code: $out"
