#!/bin/sh
bin="./node_modules/.bin/agentlintel";
[ -x "$bin" ] || bin=$(command -v agentlintel 2>/dev/null)
[ -n "$bin" ] || exit 0
out=$("$bin" verify --diff --quiet --bail --no-run --skip-fixtures 2>&1); code=$?
case "$out" in *"GATE FAILED"*) [ "$code" -eq 1 ] && { echo "$out" >&2; exit 2; };; esac
[ "$code" -eq 0 ] || echo "agentlintel: exit $code: $out"
