import { ApiProxy, ApiProxyResult } from '@/lib/proxy/ApiProxy'
import { NextRequest, NextResponse } from 'next/server'

export class SecurityHeadersProxy implements ApiProxy {
	public constructor() {}

	public apply(_request: NextRequest, response: NextResponse): ApiProxyResult {
		response.headers.set('X-Frame-Options', 'DENY')
		response.headers.set('X-Content-Type-Options', 'nosniff')
		response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
		response.headers.set('Permissions-Policy', 'geolocation=(), microphone=(), camera=()')

		if (process.env.NODE_ENV === 'production') {
			response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
		}

		return { earlyReturn: false, result: response }
	}
}
