// AGENTLINTEL-EXEMPT: domain.purity
// Reason: legacy provider SDK leaks types into our domain model; refactor scheduled in Q3.
// Approver: arch-review@example.com
// Expires: 2026-09-30
// Owner: capability-team@example.com
// Decision: ADR-26

import type { LegacyClient } from 'legacy-capability-sdk'

export type LegacyCapabilityReceipt = LegacyClient['Receipt']
