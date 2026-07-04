type CreateItemInput = {
  title: string
  referenceCode: string
}

function parseCreateItemInput(input: unknown): CreateItemInput {
  if (!input || typeof input !== 'object') throw new Error('invalid payload')
  const body = input as Record<string, unknown>
  if (typeof body.title !== 'string') throw new Error('title must be a string')
  if (typeof body.referenceCode !== 'string') throw new Error('referenceCode must be a string')
  return { title: body.title, referenceCode: body.referenceCode }
}

export async function createItemHandler(
  req: { body: unknown },
  deps: { createItem: (input: CreateItemInput) => Promise<unknown> },
) {
  const input = parseCreateItemInput(req.body)
  return deps.createItem(input)
}
