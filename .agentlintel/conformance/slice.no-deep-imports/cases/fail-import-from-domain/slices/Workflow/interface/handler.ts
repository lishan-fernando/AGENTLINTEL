import { referenceCode } from 'slices/Capability/domain/itemRules'

export function checkWorkflow(rawReferenceCode: string) {
  return referenceCode(rawReferenceCode)
}
