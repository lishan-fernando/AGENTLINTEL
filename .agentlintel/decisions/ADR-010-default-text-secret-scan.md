# ADR-010: Use Default Text Scan for Secret Logging

Accepted: 2026-07-04

`secrets.no-logging` now relies on the CLI default text-extension scanner
instead of repeating an explicit language list in every rules file. This keeps
the starter packs lean while extending coverage to Rust, Kotlin, Swift, C/C++,
Scala, and Elixir-like source files through one machine-tested extension list.

The rule remains fixture-backed and still excludes tests, generated templates,
and dependency/vendor trees.
