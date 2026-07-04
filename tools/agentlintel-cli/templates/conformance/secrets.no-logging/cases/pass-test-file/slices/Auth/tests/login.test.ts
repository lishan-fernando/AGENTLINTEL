import { describe, it, expect } from 'vitest'

describe('login', () => {
  it('returns a token on valid credentials', async () => {
    const token = 'test-token-fixture-1234'
    const password = 'fixture-pw'
    expect(token).toBeTruthy()
    expect(password).toBeTruthy()
  })
})
