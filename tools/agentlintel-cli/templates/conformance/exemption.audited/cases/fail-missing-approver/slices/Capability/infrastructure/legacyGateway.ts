// AGENTLINTEL-EXEMPT: domain.purity
// Reason: legacy SDK leaks types
// Expires: 2026-09-30
// Owner: capability-team@example.com

import type { LegacyClient } from 'legacy-capability-sdk'
export type LegacyCapabilityReceipt = LegacyClient['Receipt']
