# Exemplar Slice Template

Compact reference for the shape agents should mirror when no product exemplar
has been registered yet. Real adopters should replace this with a working slice.

Expected slice shape:

- one public entry point;
- private domain/application/infrastructure/interface internals;
- `Result` for expected business failures;
- boundary validation before business logic;
- stable slice-local error codes;
- tests beside the slice or in the repo's normal test location.

The manifest is illustrative only. Code is the real exemplar; this directory is
a bootstrap reminder for this framework repo.
