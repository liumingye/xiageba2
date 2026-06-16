import { PrismaClient } from '@prisma/client'

const g = globalThis as any

if (process.env.NODE_ENV !== 'production' && g.__prisma_client) {
  // HMR 恢复，避免重复实例化
}

const ensureClient = (): PrismaClient => {
  if (!g.__prisma_client_store) {
    g.__prisma_client_store = new PrismaClient()
  }
  return g.__prisma_client_store
}

export const usePrisma = ensureClient
export default ensureClient
