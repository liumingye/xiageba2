import { PrismaClient } from '@prisma/client'
import { requireAuth } from '~/server/utils/auth'

const prisma = new PrismaClient()

export default defineEventHandler(async (event) => {
  const method = event.method
  
  requireAuth(event)
  
  if (method === 'POST') {
    const body = await readBody(event)
    const { title, artist, album, cover, lyrics, playUrl, downloads } = body
    
    if (!title || !artist) {
      throw createError({ statusCode: 400, message: '歌名和歌手不能为空' })
    }
    
    const music = await prisma.music.create({
      data: {
        title,
        artist,
        album: album || '',
        cover: cover || '',
        lyrics: lyrics || '',
        playUrl: playUrl || '',
        downloads: JSON.stringify(downloads || [])
      }
    })
    
    return music
  }
  
  if (method === 'PUT') {
    const body = await readBody(event)
    const { id, title, artist, album, cover, lyrics, playUrl, downloads } = body
    
    if (!id) {
      throw createError({ statusCode: 400, message: '缺少音乐ID' })
    }
    
    const music = await prisma.music.update({
      where: { id },
      data: {
        title,
        artist,
        album,
        cover,
        lyrics,
        playUrl,
        downloads: JSON.stringify(downloads || [])
      }
    })
    
    return music
  }
  
  if (method === 'DELETE') {
    const body = await readBody(event)
    const { id } = body
    
    if (!id) {
      throw createError({ statusCode: 400, message: '缺少音乐ID' })
    }
    
    await prisma.music.delete({
      where: { id }
    })
    
    return { success: true }
  }
  
  throw createError({ statusCode: 405, message: '不支持的请求方法' })
})
