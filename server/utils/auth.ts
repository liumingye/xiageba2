import { createHmac, createHash, randomBytes } from 'crypto'

const SECRET = process.env.ADMIN_SECRET || 'music-admin-secret-key-change-in-production'

export const generateToken = (username: string): string => {
  const payload = JSON.stringify({
    username,
    exp: Date.now() + 1000 * 60 * 60 * 24 * 7
  })
  const encoded = Buffer.from(payload).toString('base64')
  const signature = createHmac('sha256', SECRET).update(encoded).digest('hex')
  return `${encoded}.${signature}`
}

export const verifyToken = (token: string): { username: string } | null => {
  if (!token) return null
  
  const parts = token.split('.')
  if (parts.length !== 2) return null
  
  const [encoded, signature] = parts
  const expectedSignature = createHmac('sha256', SECRET).update(encoded).digest('hex')
  
  if (signature !== expectedSignature) return null
  
  try {
    const payload = JSON.parse(Buffer.from(encoded, 'base64').toString())
    if (payload.exp < Date.now()) return null
    return { username: payload.username }
  } catch {
    return null
  }
}

export const getTokenFromEvent = (event: any): string | null => {
  const authHeader = getHeader(event, 'authorization')
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7)
  }
  
  const cookies = parseCookies(event)
  if (cookies && cookies['admin-token']) {
    return cookies['admin-token']
  }
  
  return null
}

export const requireAuth = (event: any): { username: string } => {
  const token = getTokenFromEvent(event)
  const decoded = verifyToken(token)
  if (!decoded) {
    throw createError({
      statusCode: 401,
      message: '未登录或登录已过期'
    })
  }
  return decoded
}
