import { randomBytes } from 'crypto'

export interface SessionRecord {
  id: string
  username: string
  createdAt: number
  expiresAt: number
}

/** 会话有效期 24 小时 */
const SESSION_TTL_MS = 24 * 60 * 60 * 1000

/** Cookie 名 */
export const SESSION_COOKIE = 'qy_lan_sid'

/**
 * 内存会话表：token → 记录
 */
export class SessionStore {
  private sessions = new Map<string, SessionRecord>()

  create(username: string): SessionRecord {
    const id = randomBytes(24).toString('hex')
    const now = Date.now()
    const rec: SessionRecord = {
      id,
      username,
      createdAt: now,
      expiresAt: now + SESSION_TTL_MS
    }
    this.sessions.set(id, rec)
    return rec
  }

  get(id: string | undefined | null): SessionRecord | null {
    if (!id) return null
    const rec = this.sessions.get(id)
    if (!rec) return null
    if (Date.now() > rec.expiresAt) {
      this.sessions.delete(id)
      return null
    }
    return rec
  }

  destroy(id: string | undefined | null): void {
    if (id) this.sessions.delete(id)
  }

  /** 清除全部会话（改密码 / 关闭远程时） */
  clearAll(): void {
    this.sessions.clear()
  }

  /** 清理过期会话 */
  purgeExpired(): void {
    const now = Date.now()
    Array.from(this.sessions.entries()).forEach(([id, rec]) => {
      if (now > rec.expiresAt) this.sessions.delete(id)
    })
  }
}

/**
 * 从 Cookie 头解析指定 cookie 值
 */
export function parseCookie(
  cookieHeader: string | undefined,
  name: string
): string | null {
  if (!cookieHeader) return null
  const parts = cookieHeader.split(';')
  for (const part of parts) {
    const idx = part.indexOf('=')
    if (idx < 0) continue
    const k = part.slice(0, idx).trim()
    if (k === name) {
      return decodeURIComponent(part.slice(idx + 1).trim())
    }
  }
  return null
}

/**
 * 构造 Set-Cookie 字符串
 */
export function buildSetCookie(
  name: string,
  value: string,
  opts: { maxAgeSec?: number; clear?: boolean } = {}
): string {
  if (opts.clear) {
    return `${name}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`
  }
  const maxAge =
    typeof opts.maxAgeSec === 'number' ? opts.maxAgeSec : Math.floor(SESSION_TTL_MS / 1000)
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}`
}
