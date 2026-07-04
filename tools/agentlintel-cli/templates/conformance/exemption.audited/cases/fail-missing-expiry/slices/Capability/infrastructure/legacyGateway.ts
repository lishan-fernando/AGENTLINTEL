// AGENTLINTEL-EXEMPT: domain.purity
// Reason: legacy SDK leaks types
// Approver: arch-review@example.com
// Owner: capability-team@example.com

import type { LegacyClient } from 'legacy-capability-sdk'
export type LegacyCapabilityReceipt = LegacyClient['Receipt']
