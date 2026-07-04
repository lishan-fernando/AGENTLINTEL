type EventReceivedEvent = {
  sku: string
  quantity: number
}

function validateEventReceivedEvent(payload: unknown): EventReceivedEvent {
  if (!payload || typeof payload !== 'object') throw new Error('invalid payload')
  const event = payload as Record<string, unknown>
  if (typeof event.sku !== 'string') throw new Error('sku must be a string')
  if (typeof event.quantity !== 'number') throw new Error('quantity must be a number')
  return { sku: event.sku, quantity: event.quantity }
}

export async function eventReceivedWebhook(
  rawBody: unknown,
  deps: { applyAdjustment: (event: EventReceivedEvent) => Promise<void> },
) {
  const event = validateEventReceivedEvent(rawBody)
  await deps.applyAdjustment(event)
}
