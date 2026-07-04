export async function login(email: string, password: string) {
  const userId = await verifyCredentials(email, password)
  const token = await issueToken(userId)
  console.log('issued', { email, token })
  return token
}

declare function verifyCredentials(email: string, password: string): Promise<string>
declare function issueToken(userId: string): Promise<string>
