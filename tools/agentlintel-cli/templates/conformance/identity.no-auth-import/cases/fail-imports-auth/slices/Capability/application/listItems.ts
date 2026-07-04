import { AuthService } from 'slices/Auth'

export async function listItems(userId: string) {
  if (!AuthService.canRead(userId)) return []
  return [{ id: 'item-1', title: 'Sample' }]
}
