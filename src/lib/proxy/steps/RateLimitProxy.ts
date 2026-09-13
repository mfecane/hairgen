import { ApiProxy, ApiProxyResult } from '@/lib/proxy/ApiProxy'
import { RateLimiter } from '@/lib/proxy/RateLimiter'
import { NextRequest, NextResponse } from 'next/server'

export class RateLimitProxy implements ApiProxy {
	private static readonly ONE_MINUTE_MS: number = 60 * 1000
	private static readonly DEFAULT_LIMIT: number = 100
	private static readonly AUTH_EMAIL_REQUEST_LIMIT: number = 5

	private readonly limiter: RateLimiter = new RateLimiter()

	public apply(request: NextRequest, response: NextResponse): ApiProxyResult {
		const pathname: string = request.nextUrl.pathname
		let rateLimitedResponse: NextResponse | null = null
		if (pathname === '/api/auth/email/request') {
			rateLimitedResponse = this.applyRateLimitToResponse(
				request,
				response,
				RateLimitProxy.AUTH_EMAIL_REQUEST_LIMIT,
				RateLimitProxy.ONE_MINUTE_MS
			)
		} else {
			rateLimitedResponse = this.applyRateLimitToResponse(
				request,
				response,
				RateLimitProxy.DEFAULT_LIMIT,
				RateLimitProxy.ONE_MINUTE_MS
			)
		}

		if (rateLimitedResponse !== null) {
			return { earlyReturn: true, result: rateLimitedResponse }
		}
		return { earlyReturn: false, result: response }
	}

	private getRateLimitKey(req: NextRequest, identifier?: string): string {
		const ip = req.headers.get('x-forwarded-for')?.split(',')[0] || req.headers.get('x-real-ip') || 'unknown'
		return identifier ? `${identifier}:${ip}` : `ip:${ip}`
	}

	private applyRateLimitToResponse(
		request: NextRequest,
		response: NextResponse,
		limit: number,
		windowMs: number
	): NextResponse | null {
		const key = this.getRateLimitKey(request)
		const rateLimit = this.limiter.check(key, limit, windowMs)

		response.headers.set('X-RateLimit-Limit', limit.toString())
		response.headers.set('X-RateLimit-Remaining', rateLimit.remaining.toString())
		response.headers.set('X-RateLimit-Reset', Math.ceil(rateLimit.resetTime / 1000).toString())

		if (!rateLimit.allowed) {
			const retryAfter = Math.ceil((rateLimit.resetTime - Date.now()) / 1000)
			return NextResponse.json(
				{
					error: 'RATE_LIMIT_EXCEEDED',
					message: 'Too many requests. Please try again later.',
					retryAfter,
				},
				{
					status: 429,
					headers: response.headers,
				}
			)
		}

		return null
	}
}
