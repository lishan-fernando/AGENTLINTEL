import { tokenStore } from 'slices/Auth/infrastructure/tokenStore'

export async function login(email: string) {
  return tokenStore.issueFor(email)
}
