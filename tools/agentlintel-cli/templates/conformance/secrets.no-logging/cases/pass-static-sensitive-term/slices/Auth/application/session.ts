export function noteSessionState(userId: string) {
  console.info('session token not found')
  logger.warn('secret metadata was unavailable', { userId })
}

declare const logger: { warn(message: string, context: unknown): void }
