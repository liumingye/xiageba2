import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'

const g = globalThis as any

const createClient = (): PrismaClient => {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) {
    throw new Error(
      'DATABASE_URL 环境变量未设置 — 请在 .env 或部署环境中配置',
    )
  }

  const pool = new Pool({ connectionString })
  const adapter = new PrismaPg(pool)
  return new PrismaClient({ adapter })
}

export const usePrisma = (): PrismaClient => {
  if (!g.__prisma_client_store) {
    g.__prisma_client_store = createClient()
  }
  return g.__prisma_client_store
}

export default usePrisma
