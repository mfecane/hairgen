import { RateLimiter } from '@/lib/proxy/RateLimiter'
import { NextRequest } from 'next/server'

const ONE_MINUTE_MS = 60 * 1000

/** One entry per route excluded from proxy.ts's matcher (see proxy.ts comment). */
export enum UploadRateLimitBucket {
	ChatUpload = 'chat-upload',
	MediaUpload = 'media-upload',
	StyleUpload = 'style-upload',
	ModelUpload = 'model-upload',
	HairCardBakeUpload = 'hair-card-bake-upload',
}

type BucketConfig = {
	limit: number
	windowMs: number
}

const BUCKET_CONFIG: Record<UploadRateLimitBucket, BucketConfig> = {
	[UploadRateLimitBucket.ChatUpload]: { limit: 20, windowMs: ONE_MINUTE_MS },
	[UploadRateLimitBucket.MediaUpload]: { limit: 10, windowMs: ONE_MINUTE_MS },
	[UploadRateLimitBucket.StyleUpload]: { limit: 100, windowMs: ONE_MINUTE_MS },
	[UploadRateLimitBucket.ModelUpload]: { limit: 10, windowMs: ONE_MINUTE_MS },
	// An atlas bake POST carries up to 8 PNGs in one request - heavier than the single-file buckets above.
	[UploadRateLimitBucket.HairCardBakeUpload]: { limit: 5, windowMs: ONE_MINUTE_MS },
}

/**
 * Rate limiting for routes excluded from proxy.ts's matcher — those never reach
 * RateLimitProxy, so they check in-handler instead, against the same limit they'd
 * have gotten from the proxy pipeline.
 */
export class UploadRateLimiter {
	private readonly limiter: RateLimiter = new RateLimiter()

	public enforce(req: NextRequest, bucket: UploadRateLimitBucket): Response | null {
		const { limit, windowMs } = BUCKET_CONFIG[bucket]
		const ip = req.headers.get('x-forwarded-for')?.split(',')[0] || req.headers.get('x-real-ip') || 'unknown'
		const result = this.limiter.check(`${bucket}:${ip}`, limit, windowMs)

		if (!result.allowed) {
			const retryAfter = Math.ceil((result.resetTime - Date.now()) / 1000)
			return Response.json(
				{ error: 'RATE_LIMIT_EXCEEDED', message: 'Too many requests. Please try again later.', retryAfter },
				{ status: 429, headers: { 'Retry-After': retryAfter.toString() } }
			)
		}

		return null
	}
}

export const uploadRateLimiter = new UploadRateLimiter()
