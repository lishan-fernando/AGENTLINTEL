#!/bin/sh
bin="./node_modules/.bin/agentlintel";
[ -x "$bin" ] || bin=$(command -v agentlintel 2>/dev/null)
[ -n "$bin" ] || { echo "agentlintel: CLI not found" >&2; exit 2; }
out=$("$bin" verify --diff --quiet --bail --no-run --skip-fixtures 2>&1); code=$?
[ "$code" -eq 0 ] || { echo "$out" >&2; exit 2; }
