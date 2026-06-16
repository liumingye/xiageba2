import { PrismaClient } from '@prisma/client'

let client: PrismaClient | null = null
let initializing = false
const initQueue: Array<(c: PrismaClient) => void> = []

const getPrisma = (): PrismaClient => {
  if (client) return client

  if (initializing) {
    // 并发进入时，用队列避免重复实例化
    throw new Error('Prisma initializing')
  }

  initializing = true
  client = new PrismaClient()
  initializing = false

  while (initQueue.length > 0) {
    const cb = initQueue.shift()
    if (cb && client) cb(client)
  }

  if (process.env.NODE_ENV !== 'production') {
    const g = globalThis as any
    if (!g.__prisma_client) g.__prisma_client = client
  }

  return client!
}

// 开发模式下从 globalThis 恢复，避免 HMR 重复实例化
if (process.env.NODE_ENV !== 'production') {
  const g = globalThis as any
  if (g.__prisma_client) client = g.__prisma_client
}

export const usePrisma = getPrisma
export default getPrisma
