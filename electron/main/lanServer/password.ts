import { randomBytes, scryptSync, timingSafeEqual } from 'crypto'

/** scrypt 参数：N=16384, r=8, p=1；输出 32 字节 */
const SCRYPT_N = 16384
const SCRYPT_R = 8
const SCRYPT_P = 1
const KEY_LEN = 32
const SALT_LEN = 16

/**
 * 生成密码哈希：格式 scrypt$N$r$p$saltB64$hashB64
 */
export function hashPassword(password: string): string {
  const salt = randomBytes(SALT_LEN)
  const hash = scryptSync(password, salt, KEY_LEN, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P
  })
  return [
    'scrypt',
    String(SCRYPT_N),
    String(SCRYPT_R),
    String(SCRYPT_P),
    salt.toString('base64'),
    hash.toString('base64')
  ].join('$')
}

/**
 * 校验密码与存储哈希是否匹配（常量时间比较）
 */
export function verifyPassword(password: string, stored: string): boolean {
  if (!stored || typeof stored !== 'string') return false
  const parts = stored.split('$')
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false
  const N = Number(parts[1])
  const r = Number(parts[2])
  const p = Number(parts[3])
  if (!Number.isFinite(N) || !Number.isFinite(r) || !Number.isFinite(p)) {
    return false
  }
  try {
    const salt = Buffer.from(parts[4], 'base64')
    const expected = Buffer.from(parts[5], 'base64')
    if (salt.length === 0 || expected.length === 0) return false
    const actual = scryptSync(password, salt, expected.length, { N, r, p })
    if (actual.length !== expected.length) return false
    return timingSafeEqual(actual, expected)
  } catch {
    return false
  }
}
