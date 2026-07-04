import type { ItemId } from '../contract/types'

export function isPublishable(item: { title: string; referenceCode: string }) {
  return item.title.length > 0 && /^[0-9]{10,13}$/.test(item.referenceCode)
}

export function nextEditionId(current: ItemId): ItemId {
  return `${current}-v2` as ItemId
}
