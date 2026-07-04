type EventReceivedEvent = {
  sku: string
  quantity: number
}

export async function eventReceivedWebhook(
  rawBody: unknown,
  deps: { applyAdjustment: (event: EventReceivedEvent) => Promise<void> },
) {
  const event = rawBody as EventReceivedEvent
  await deps.applyAdjustment(event)
}
