export async function login(email: string, credential: string) {
  const userId = await verifyCredentials(email, credential)
  console.log('login attempt', { email, userId })
  return userId
}

declare function verifyCredentials(email: string, credential: string): Promise<string>
