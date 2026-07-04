import type { AuthorizationPort } from 'shared/ports/AuthorizationPort'
import type { ExecutionContext } from 'shared/ExecutionContext'

export async function listItems(
  ctx: ExecutionContext,
  deps: { authz: AuthorizationPort },
) {
  const allowed = await deps.authz.can(ctx, 'capability.read')
  if (!allowed) return { ok: false as const, errors: [{ code: 'CAPABILITY-AUTH-001', message: 'denied' }] }
  return { ok: true as const, data: [] }
}
