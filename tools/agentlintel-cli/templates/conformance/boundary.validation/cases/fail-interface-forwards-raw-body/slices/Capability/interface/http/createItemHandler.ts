type CreateItemInput = {
  title: string
  referenceCode: string
}

export async function createItemHandler(
  req: { body: unknown },
  deps: { createItem: (input: CreateItemInput) => Promise<unknown> },
) {
  return deps.createItem(req.body as CreateItemInput)
}
