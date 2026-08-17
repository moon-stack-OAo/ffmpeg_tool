/**
 * 简易登录限流：按 IP 滑动窗口
 * 默认 15 分钟内最多 10 次失败
 */
export class LoginRateLimiter {
  private fails = new Map<string, number[]>()
  private readonly windowMs: number
  private readonly maxFails: number

  constructor(windowMs = 15 * 60 * 1000, maxFails = 10) {
    this.windowMs = windowMs
    this.maxFails = maxFails
  }

  private prune(ip: string, now: number): number[] {
    const list = (this.fails.get(ip) || []).filter((t) => now - t < this.windowMs)
    if (list.length === 0) {
      this.fails.delete(ip)
    } else {
      this.fails.set(ip, list)
    }
    return list
  }

  /** 是否已超限 */
  isBlocked(ip: string): boolean {
    const now = Date.now()
    return this.prune(ip, now).length >= this.maxFails
  }

  /** 剩余可尝试次数 */
  remaining(ip: string): number {
    const now = Date.now()
    return Math.max(0, this.maxFails - this.prune(ip, now).length)
  }

  recordFail(ip: string): void {
    const now = Date.now()
    const list = this.prune(ip, now)
    list.push(now)
    this.fails.set(ip, list)
  }

  reset(ip: string): void {
    this.fails.delete(ip)
  }

  clearAll(): void {
    this.fails.clear()
  }
}
