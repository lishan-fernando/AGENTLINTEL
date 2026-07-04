import { listItems } from 'slices/Capability'
import type { ItemSummary } from 'slices/Capability'

export async function handleListWorkflowableItems() {
  const result = await listItems()
  return result
}
