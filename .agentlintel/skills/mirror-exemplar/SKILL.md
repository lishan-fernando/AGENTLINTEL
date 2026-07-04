---
name: mirror-exemplar
description: Use before writing a new slice, handler, contract, or test so structure is copied from a registered exemplar.
---

# Mirror Exemplar

Working code is the convention. Read `.agentlintel/exemplars.yaml`, choose the
entry whose shape matches the task, read it, and copy its structure.

## Workflow

1. Match on business/file shape, not names alone.
2. If no exemplar fits, stop and ask for one.
3. Mirror file layout, public/private boundary, naming, validation placement,
   `Result` usage, error-code cataloging, and test style.
4. Search before adding a new error code.
5. Run `agentlintel verify`.

## Deviation

If the exemplar cannot fit, report the mismatch and propose either a new
exemplar or an ADR-backed deviation. Do not silently invent a third pattern.

## Completion

State exemplar path, files changed, new error codes or `none`, verify output,
and deviations or `none`.
