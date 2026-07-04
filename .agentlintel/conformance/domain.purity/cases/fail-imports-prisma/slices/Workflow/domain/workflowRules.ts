import { PrismaClient } from 'prisma'

const prisma = new PrismaClient()

export async function loadWorkflow(id: string) {
  return prisma.workflow.findUnique({ where: { id } })
}
