export type RateLimitResult = {
	allowed: boolean
	remaining: number
	resetTime: number
}

/**
 * Sliding-window in-memory rate limiter, keyed by an arbitrary string.
 * Shared by RateLimitProxy (Node.js proxy pipeline) and UploadRateLimiter
 * (in-handler, for routes excluded from that pipeline — see proxy.ts).
 */
export class RateLimiter {
	private static readonly CLEANUP_INTERVAL_MS: number = 5 * 60 * 1000

	private readonly store: Map<string, { count: number; resetTime: number }> = new Map()
	private cleanupIntervalId: ReturnType<typeof setInterval> | null = null

	public constructor() {
		this.scheduleCleanup()
	}

	public check(key: string, limit: number, windowMs: number): RateLimitResult {
		const now = Date.now()
		const entry = this.store.get(key)

		if (!entry || entry.resetTime < now) {
			const resetTime = now + windowMs
			this.store.set(key, { count: 1, resetTime })
			return { allowed: true, remaining: limit - 1, resetTime }
		}

		if (entry.count >= limit) {
			return { allowed: false, remaining: 0, resetTime: entry.resetTime }
		}

		entry.count++
		this.store.set(key, entry)
		return { allowed: true, remaining: limit - entry.count, resetTime: entry.resetTime }
	}

	private scheduleCleanup(): void {
		if (this.cleanupIntervalId !== null) {
			return
		}
		this.cleanupIntervalId = setInterval(() => {
			const now = Date.now()
			for (const [key, value] of this.store.entries()) {
				if (value.resetTime < now) {
					this.store.delete(key)
				}
			}
		}, RateLimiter.CLEANUP_INTERVAL_MS)
	}
}
