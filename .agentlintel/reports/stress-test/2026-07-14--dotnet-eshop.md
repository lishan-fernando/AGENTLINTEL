# AgentLintel stress test: dotnet/eShop

| Field | Value |
|---|---|
| Date | 2026-07-14 |
| Status | Two-stage empirical result: four-arm pilot plus one matched upgrade rerun |
| Subject | Microsoft/.NET `dotnet/eShop`, tag `dotnet8` |
| Frozen commit | `f2369529433374a01b864b6fa1499ad894756f53` |
| Subject size | 1,057 tracked files; 529 C# files; 25 C# projects |
| Coding model | `gpt-5.6-terra`, high reasoning effort |
| Review | Three independent blind patch reviews plus adjudication |
| Scope | Product diff quality, architecture drift, gate behavior, and operating cost |

## Answer first

The brutal result is mixed: a good `SKILL.md` plus `AGENTS.md` can replace
AgentLintel's advice, but it did not replace deterministic enforcement. The
original AgentLintel treatment also failed badly because its rules prohibited
known bad code without requiring the requested architecture to exist.

After the verifier gained positive, whole-scope evidence rules, the upgraded
gate rejected the old treatment patch with 35 findings. In a fresh matched run,
the native-gate control C2 and upgraded AgentLintel treatment E used identical
instructions and native tests. E fixed the known pending-state, stale-result,
contract, query, WebApp, and risk-test gaps. Held-out checks scored C2 6/14 and
E 13/14; E's sole reported miss was an evaluator false negative because the
required Payment contract fields are present in the verified source.

That is useful evidence, but it is **not a win under the preregistered bar**.
Three blind reviewers gave C2 a mean weighted escape score of 18.0 and E 16.7,
only 7.4% lower instead of the required 20%. Every reviewer rejected both
patches. E also shipped handwritten migrations that Entity Framework does not
discover, and both arms allow contradictory refund redelivery to restore stock
for an order that remains paid.

Therefore:

- `SKILL.md` plus `AGENTS.md` is enough for guidance, but not for a reliable PR
  gate.
- A skill plus well-designed native tests or scripts can enforce most of the
  same contracts; AgentLintel does not own a unique enforcement primitive.
- AgentLintel packages enforcement, fixtures, ratcheting, write guards,
  exemplars, and governance coherently, but this one task does not prove that
  packaging produces a decisive product-quality advantage.
- Keep the positive-evidence capability; do not market it as proven superior.

### Original pilot result

The first four-arm pilot did **not** demonstrate an incremental code-quality
benefit from AgentLintel over a strong skill file or the same native
architecture tests run without AgentLintel.

- The plain arm was much worse and did not implement the requested workflow.
- The skill-only arm produced the same broad architecture as the enforced arms,
  with substantially less setup and fewer coding-agent tokens.
- The skill plus native-test arm was the strongest final patch.
- The AgentLintel arm passed all configured checks while retaining a critical
  path that can cancel an order before refund confirmation.
- Every arm omitted required query/WebApp delivery and every final patch was
  rejected by the reliability review.

The engineer's narrow claim—"a strong skill can achieve the same result"—is
supported in this single case. It is not proved generally: this is one task and
one stochastic run per arm. AgentLintel's governance protections may still be
valuable, but they did not produce a measurable product-quality advantage here.

## Upgrade rerun: positive architecture evidence

The failed original treatment exposed a framework gap: regex rules could ban a
bad pattern but could not require a feature-wide contract to exist. ADR-024
adds `required`, optional `when`, and whole-file `match: file` evidence. The
rules aggregate evidence over the full verification scope and deliberately do
not claim absence during partial or diff-only verification.

The old D product patch was replayed unchanged against the upgraded E baseline.
The no-run gate rejected it with 35 findings, including the original pending
fallthrough, throwing stale results, incomplete event payload and correlation,
missing Catalog semantic dedupe key, missing query/WebApp delivery, and missing
risk tests. This is direct verifier evidence that the added contracts cover the
known escapes; it is not evidence that they cover unknown defects.

### Matched rerun controls and cost

| Field | C2: skill + native gate | E: C2 + upgraded AgentLintel |
|---|---:|---:|
| Baseline commit | `5164cf7dc1f2a46db77d6658450383d1c83a3d2a` | `ed7ab363530c4a599a6ccb52e888a85a29e58a76` |
| Setup | 4 files, 330 insertions | 57 files, 839 insertions, 1 deletion |
| Product patch | 48 files, +1,421/-42 | 45 files, +710/-7 |
| Wall time | 677 s | 638 s |
| Input / cached tokens | 3,636,770 / 3,401,984 | 2,837,062 / 2,699,776 |
| Output / reasoning tokens | 24,424 / 6,947 | 23,234 / 6,187 |
| Held-out checks | 6/14 | 13/14 reported; 14/14 after false-negative adjudication |

The shared root instruction, skill, and native architecture source hashes were
identical across C2 and E:

- `AGENTS.md`: `7A26CCD57297468A780A2A771F737DD61DE393D311CF5E5FD6F38BA2080FAAFD`
- skill: `F646DDACEFC401CBED8CD8EC5A9C03A61832B8C3E7946F774787E2E6957A5F89`
- native checks: `1C17D272D51EB74CB51574C6F3A0DD8A6E9874292AA0B6B8EFDEBEB2B139004B`
- frozen held-out evaluator: `967FDADC6C1A38E5CEF29D252AFCC20E18AF320C99279C5F0EAC3683ABAE0C6C`

Both patches independently passed Ordering unit tests, all six native
architecture tests, Release builds for Ordering, Catalog, PaymentProcessor and
WebApp, and `git diff --check`. E additionally passed the full AgentLintel gate:
5/5 facts, zero rule violations, 22/22 fixtures, 45 guarded changed files, and
6/6 exemplars. Neither coding agent changed its instructions, skills, native
tests, or governance.

E's held-out false negative searched only the Ordering corpus for the inline
`OrderStockItem` definition. The actual Payment request contract contains
`decimal Total`, `IEnumerable<OrderStockItem>`, and
`OrderStockItem(int ProductId, int Units)`, so the human adjudication counts the
requirement as present without changing the frozen evaluator.

### Blind review and adjudicated escapes

| Reviewer | C2 score | E score | Preference |
|---|---:|---:|---|
| Alpha | 22 | 15 | E |
| Beta | 22 | 19 | E |
| Gamma | 10 | 16 | C2 |
| **Mean** | **18.0** | **16.7** | **7.4% lower for E** |

Lower is better. All reviewers rejected both patches. Two preferred E and one
preferred C2. Patch hashes were
`8758193050D9C764985C47965F58D3F1D28D65AA5500AE6051B301E37A384647`
for anonymous packet 05 (C2) and
`EBD091B8721A5C0945E80F1AAFCBA349191136D160F901DA89D39B8B4AD50C22`
for packet 06 (E).

| ID | Arm | Severity | Evidence | Finding |
|---|---|---:|---|---|
| R2-01 | C2 | 5 | `arm-c2-native-gate/src/Ordering.Domain/AggregatesModel/OrderAggregate/Order.cs:149` | The legacy cancellation method rejects Paid/Shipped but permits `CancellationPending -> Cancelled`, bypassing refund confirmation. |
| R2-02 | C2 | 5 | `arm-c2-native-gate/src/Ordering.Domain/AggregatesModel/OrderAggregate/Order.cs:183` | Stale or mismatched refund results throw instead of becoming harmless redelivery. |
| R2-03 | E | 5 | `arm-e-agentlintel-required/src/Ordering.Infrastructure/Migrations/20260714130000_AddPaidOrderCancellation.cs:1`; `arm-e-agentlintel-required/src/Catalog.Infrastructure/Migrations/20260714130000_AddRefundStockCompensations.cs:1` | Both handwritten migrations lack discoverable migration metadata/designer artifacts. `dotnet ef migrations list` shows only the frozen baseline migrations, so a normal deployment omits both schema changes. |
| R2-04 | C2,E | 5 | E `src/PaymentProcessor/IntegrationEvents/EventHandling/OrderRefundRequestedIntegrationEventHandler.cs:12`; E `src/Ordering.Domain/AggregatesModel/OrderAggregate/Order.cs:179`; E `src/Catalog.API/IntegrationEvents/EventHandling/OrderRefundSucceededIntegrationEventHandler.cs:11` | Payment recomputes outcomes from mutable configuration on every delivery. A failure followed by a redelivered success can leave Ordering paid while Catalog restores stock. No durable refund outcome prevents the contradiction. |
| R2-05 | C2,E | 3 | Product patches and blind reviews | Neither patch supplies real Payment/Catalog distributed integration tests or concurrency coverage; no optimistic concurrency contract protects concurrent result handling. |

C2's migrations are discoverable as `20260714094044_PaidCancellationMetadata`
and `20260714094124_RefundStockCompensation`. E's migration failure is the
important counterexample to a green gate: positive evidence required migration
files, but not deployable migration discovery. The next contract must execute
`dotnet ef migrations list` or an equivalent deployment check instead of
matching filenames.

The rerun therefore improves the framework diagnosis but does not reverse the
study conclusion. E is directionally better on the defects encoded after the
pilot, used fewer coding-agent tokens, and finished slightly faster. It still
missed two critical distributed/deployment risks, failed every blind acceptance
decision, and fell well short of the 20% severity threshold. One task and one
seed cannot establish general value.

## Subject and controls

The subject is the official, MIT-licensed .NET reference application:

- Repository: <https://github.com/dotnet/eShop>
- Frozen release: <https://github.com/dotnet/eShop/releases/tag/dotnet8>
- Frozen commit: <https://github.com/dotnet/eShop/commit/f2369529433374a01b864b6fa1499ad894756f53>
- License: <https://github.com/dotnet/eShop/blob/dotnet8/LICENSE>

The snapshot was kept identical across arms. A portable .NET SDK 8.0.422 was
used. Current NuGet auditing rejects one frozen OpenTelemetry dependency, so
`-p:NuGetAudit=false` was applied to the upstream baseline and every arm. This
is a harness control, not a treatment-specific waiver.

The feature prompt is frozen at
`examples/agentlintel-stress/feature-prompt.md`. It requests a paid-order
cancellation saga across Ordering, PaymentProcessor, Catalog, persistence,
queries, WebApp, and tests.

## Arms

| Arm | Treatment | Configuration baseline | Setup size |
|---|---|---|---:|
| A | Upstream instructions only | `f2369529433374a01b864b6fa1499ad894756f53` | 0 files |
| B | Strong eShop-specific `SKILL.md` and identical root `AGENTS.md` | `3d21d125b648e9163fb5f64844354cbbdd709615` | 2 files, 105 lines |
| C | Same skill plus native C# architecture tests, no AgentLintel | `5164cf7dc1f2a46db77d6658450383d1c83a3d2a` | 4 files, 330 lines |
| D | Same skill and native tests plus AgentLintel rules, fixtures, facts, guard, and exemplars | `c04092fcd8cfa5fd11c9520cb34c060adaa263d6` | 29 files, 552 lines |

The B/C/D instruction files were byte-identical:

- Skill SHA-256: `9E0D8527EB7A97B29AFEDE6CE23EF2F40C1E5C53BA001B6F515DAEC755D47289`
- Root `AGENTS.md` SHA-256: `474F7B4322311F2D4A827FCC32F7C02CE748F9EB14074938361872C991A202AC`
- C/D native test source SHA-256: `768FFCE2E9FD7CBB418DDE10710BED3A5E22F6DE8390098999A61DCAFBF51795`

Arm C is necessary for causal interpretation: AgentLintel's built-in `layers`
engine is JavaScript/TypeScript-specific, so the C# semantic checks in D are an
external .NET test suite. C versus D isolates the wrapper/governance layer from
the native test suite itself.

## Agent and run controls

All arms used the same mid-tier model, `gpt-5.6-terra`, described in the local
Codex model catalog as a balanced everyday coding model. Reasoning effort was
set to high. The premium default model was not used. Runs were parallel,
ephemeral, started from their treatment baseline, received the exact same
feature prompt, and were told not to change governance or dependencies.

The first batch encountered a harness failure: the requested workspace-write
sandbox was read-only for all four agents. All four produced zero diff. That
batch was excluded before inspecting product quality, and one symmetric retry
was run with the writable sandbox probe configuration. Excluded input-token
counts were A 242,137; B 501,238; C 424,336; D 281,072. Raw logs are retained
under `examples/agentlintel-stress/logs/`.

## Baselines and independent verification

| Check | Baseline | A | B | C | D |
|---|---:|---:|---:|---:|---:|
| Ordering unit tests | 29/29 | 30/30 | 35/35 | 35/35 | 35/35 |
| Ordering build | pass | pass | pass | pass | pass |
| Catalog build | pass | pass | pass | pass | pass |
| PaymentProcessor build | pass | pass | pass | pass | pass |
| WebApp build | pass | pass | pass | pass | pass |
| Native architecture tests | n/a | n/a | n/a | 6/6 | 6/6 |
| AgentLintel full strict gate | n/a | n/a | n/a | n/a | pass |
| `git diff --check` | clean | clean | clean | clean | clean |

The D gate reported 5/5 facts fresh, zero final rule violations, 8/8 fixtures,
44 changed files inside the guard, and 6/6 exemplars. Passing checks therefore
means build and configured-contract health only; it did not mean feature
acceptance.

## Raw outcome and cost

| Arm | Product diff | Wall time | Input tokens | Cached input | Output tokens |
|---|---:|---:|---:|---:|---:|
| A | 11 files, +108/-8 | 233 s | 850,602 | 741,376 | 7,727 |
| B | 41 files, +1,175/-46 | 496 s | 1,961,205 | 1,803,520 | 18,465 |
| C | 46 files, +1,230/-45 | 593 s | 2,910,428 | 2,786,048 | 22,782 |
| D | 44 files, +1,196/-47 | 643 s | 2,913,634 | 2,724,352 | 22,927 |

A was fast because it skipped most requirements. B used about 33% fewer input
tokens than D and finished about 23% faster, while producing a comparably
structured but still unsafe patch. C and D used essentially the same tokens;
D took 50 seconds longer in this one run. Setup-authoring cost is not included
in these coding-agent figures and was much larger for D.

## Blind review

Complete patches, including untracked files, were frozen and SHA-256 hashed.
Three reviewers received only anonymous packet files and the feature prompt.
They were prohibited from reading arm paths, logs, skills, or treatment config.

| Packet | Revealed arm | Patch SHA-256 | Structured score |
|---|---|---|---:|
| 01 | C | `BF3AE4EFBA92B00A66928854C479CDB2DBBA9FC82ABACF80F91DE6EF47FBA610` | 21 |
| 02 | A | `8484CBF4A13E6D480AA50AD36FFDC320B75C56D7932661EC50D7F2E444A5D184` | 38 |
| 03 | D | `4D0DA8DF6E7CF069F15C707FCED561F11C4C39B1D3AD62957D37A0967710105E` | 25 |
| 04 | B | `564732313126768B490FBCDA3B7AC34E15754C9C7D45B0FA9901B89BC1D16327` | 23 |

The structured score is one reviewer's sum across eight 0/1/3/5 categories;
lower is better. The other two reviewers independently agreed that C was best,
A was worst, and all four must be rejected. Their relative ordering of B and D
was not robust, which is itself evidence against claiming a D advantage.

## Findings

Severity scale: 5 critical data/security integrity, 3 major behavior or
architecture gap, 1 minor maintainability/noise.

| ID | Arm | Severity | Evidence | Finding and required action |
|---|---|---:|---|---|
| ST-01 | A | 5 | `arm-a-plain/src/Ordering.Domain/AggregatesModel/OrderAggregate/Order.cs:142`; `.../OrderStatusChangedToCancelledIntegrationEventHandler.cs:12` | Paid orders move directly to `Cancelled`, and Catalog restores stock on the cancellation notification before refund confirmation. Introduce the pending/result state machine. |
| ST-02 | A | 5 | `arm-a-plain/src/PaymentProcessor/IntegrationEvents/EventHandling/OrderStatusChangedToCancelledIntegrationEventHandler.cs:11`; `arm-a-plain/src/Catalog.API/IntegrationEvents/EventHandling/OrderStatusChangedToCancelledIntegrationEventHandler.cs:16` | Payment only logs; it emits no success/failure. Catalog has no durable dedupe, so redelivery restores stock repeatedly. |
| ST-03 | B | 5 | `arm-b-skill/src/PaymentProcessor/IntegrationEvents/Events/OrderRefundSucceededIntegrationEvent.cs:3`; `arm-b-skill/src/Ordering.Domain/AggregatesModel/OrderAggregate/Order.cs:193` | Refund results contain only order ID. A delayed result from attempt A can complete or fail attempt B. Persist and compare an attempt/event correlation ID. |
| ST-04 | D | 5 | `arm-d-agentlintel/src/Ordering.API/Application/Commands/CancelOrderCommandHandler.cs:44`; `arm-d-agentlintel/src/Ordering.Domain/AggregatesModel/OrderAggregate/Order.cs:154` | A second HTTP request while `CancellationPending` takes the handler's legacy branch, whose aggregate guard permits pending-to-cancelled. It can cancel before any refund result. Reject or idempotently ignore pending requests. |
| ST-05 | C,D | 5 | `arm-c-native-gate/src/Ordering.Domain/AggregatesModel/OrderAggregate/Order.cs:177`; `arm-d-agentlintel/src/Ordering.Domain/AggregatesModel/OrderAggregate/Order.cs:200` | Stale/conflicting results throw once state or request ID changes. Failure followed by a real success can leave a refunded order paid and poison retries. Old results must be harmless and outcome ordering must be defined. |
| ST-06 | B,C,D | 5 | `arm-b-skill/src/PaymentProcessor/IntegrationEvents/EventHandling/OrderCancellationRequestedIntegrationEventHandler.cs:8`; equivalent C/D handlers | Payment directly performs/publishes for each delivery with no durable inbox/outbox or semantic refund receipt. A crash or concurrent distinct request can duplicate a real refund. Add durable idempotency at the side-effect owner. |
| ST-07 | B,C,D | 3 | B/C/D `OrderCancellationRequestedIntegrationEvent.cs:3` | Every request contract omits required total and product/unit pairs; none returns the request integration event's `Id` as correlation. Payment cannot price or trace the specified refund contract. |
| ST-08 | B,C,D | 3 | B `Order.cs:183`; C `Order.cs:166`; D `Order.cs:189` | A retry clears the last failure timestamp/reason instead of retaining the requested audit history. Preserve “last failed” metadata until a later failure or explicit retention rule. |
| ST-09 | B,C,D | 3 | B `OrdersApi.cs:22`; C `CancelOrderCommandValidator.cs:7`; D `CancelOrderCommandValidator.cs:9` | Reusing the legacy cancellation endpoint changes pre-payment behavior, and all three validators omit the 10-character minimum. Separate or condition the paid path while preserving existing behavior. |
| ST-10 | A,B,C,D | 3 | Anonymous patch header sweep: zero changed paths under `src/Ordering.API/Application/Queries` and zero under `src/WebApp` | No arm exposes or displays cancellation status/reason/timestamps. Implement and test the read/UI slice. |
| ST-11 | A,B,C,D | 3 | A changed 1 test; B/C/D changed 3 test files each | No arm provides the requested Payment/Catalog workflow, broker-redelivery, inventory, stale-result, migration, and full HTTP-boundary evidence. Green self-authored tests are insufficient acceptance proof. |
| ST-12 | D | 3 | `arm-d-agentlintel/src/Ordering.Domain/AggregatesModel/OrderAggregate/Order.cs:200`; `arm-d-agentlintel/.agentlintel/rules.yaml:4` | AgentLintel passed despite ST-04, ST-05, missing normal cancelled notification, incomplete event shape, missing UI/query, and incomplete tests. These are final architecture/behavior escapes. |
| ST-13 | C,D | 1 | `arm-c-native-gate/tests/ArchitectureTests/ArchitectureContractTests.cs:140`; same in D | The only native architecture failure during both runs required the literal method name `RequestPaidCancellation`. Agents renamed correct-shaped behavior to satisfy it. Replace token-name assertions with behavioral/structural contracts. |

Additional D evidence: refund completion raises only
`OrderRefundSucceededDomainEvent` at
`arm-d-agentlintel/src/Ordering.Domain/AggregatesModel/OrderAggregate/Order.cs:212`.
Its handler publishes only stock compensation at
`arm-d-agentlintel/src/Ordering.API/Application/DomainEventHandlers/OrderRefundSucceededDomainEventHandler.cs:11`,
so the normal cancelled-status notification is missing.

## Clean sweeps

The audit also checked for the following and found no violation:

- All final product projects inspected above build in Release.
- All final diffs pass whitespace/error checks.
- B/C/D keep order transitions in the aggregate and use Ordering's outbox
  integration-event service.
- B/C/D keep Payment, Ordering, and Catalog contracts service-local; no new
  business-service project reference or cross-service database write was found.
- B/C/D add Ordering and Catalog migrations and a durable Catalog receipt.
- C/D pass checks for Domain outward dependencies, endpoint repository/EventBus
  bypass, command storage/service reach-through, and contracts moved to Shared.
- D's governance files were not modified by the coding agent; the guard reported
  all 44 product files in allowed zones.

No `AGENTLINTEL-EXEMPT` marker was introduced in any arm. There are no exemption
owners or expiry dates to follow up.

## What the gate did and did not add

The C/D native contract found one low-value naming mismatch in each run and the
agents repaired it. D's AgentLintel external rule ultimately ran that same test
suite. AgentLintel additionally verified facts, fixtures, guard boundaries, and
exemplars, but the agent did not attack or edit governance, so this pilot does
not measure their defensive value.

The configured rules were too shallow for the risky distributed state machine.
This is not a verifier malfunction: AgentLintel correctly enforced what was
encoded. It is a practical adoption result—the effort to write rules and
fixtures did not yield coverage of the defects that mattered most in this C#
feature. A gate's utility is bounded by the semantic quality of its executable
contracts.

## Top three risks

1. **False confidence from green gates.** D passed while allowing premature
   cancellation and unsafe result ordering.
2. **Financial/idempotency integrity.** No arm made Payment's refund side effect
   durably idempotent; B lacks attempt correlation and C/D poison stale results.
3. **Completion blindness.** Every agent skipped the query/WebApp slice and most
   requested integration tests, yet every final summary described the feature
   as implemented.

## Decision and next experiment

Do not claim that AgentLintel improves code quality over skills based on this
result. For this repository today, retain the strong skill and native tests;
do not mandate the AgentLintel layer solely on the expectation of fewer product
defects.

Before a broader keep/remove decision, run a preregistered repeated study:

1. Use at least six tasks spanning boundaries, persistence, refactoring, and
   integration, with eight independent seeds per arm.
2. Keep A/B/C/D. C is required to isolate native executable checks from the
   AgentLintel wrapper.
3. Freeze held-out behavioral tests and architecture contracts before any
   coding run; do not let agents edit them.
4. Replace literal method-name checks with behavioral and Roslyn/assembly-level
   contracts. Include pending duplicate requests, stale/conflicting results,
   event payload shape, read/UI delivery, and durable Payment idempotency.
5. Blind review again and report final escape severity, accepted functionality,
   correction cycles, setup effort, tokens, elapsed time, exemptions, false
   positives, and false negatives.
6. Treat AgentLintel as useful only if it reduces weighted final escapes versus
   both B and C by at least 20%, loses no more than 5 percentage points of
   functional acceptance, and keeps ongoing operating overhead within 15%
   unless the saved severity justifies more.

With one run per arm, confidence intervals and causal generalization are not
available. The defensible conclusion is: **skills clearly helped; native tests
helped somewhat; AgentLintel's incremental value was not demonstrated.**

## Reproduction commands

Subject checks were run from each arm with the portable SDK on `PATH`:

```powershell
dotnet test tests/Ordering.UnitTests/Ordering.UnitTests.csproj -c Release -p:NuGetAudit=false
dotnet build src/Ordering.API/Ordering.API.csproj -c Release -p:NuGetAudit=false
dotnet build src/Catalog.API/Catalog.API.csproj -c Release -p:NuGetAudit=false
dotnet build src/PaymentProcessor/PaymentProcessor.csproj -c Release -p:NuGetAudit=false
dotnet build src/WebApp/WebApp.csproj -c Release -p:NuGetAudit=false
```

C and D also ran:

```powershell
dotnet test tests/ArchitectureTests/ArchitectureTests.csproj -c Release -p:NuGetAudit=false
```

D also ran:

```powershell
npm run agentlintel:verify
```

Raw agent logs, independent verification logs, anonymous patches, and the four
worktrees are under the ignored local path `examples/agentlintel-stress/`.
They preserve evidence for this machine but are not committed report artifacts.
