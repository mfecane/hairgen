import { ApiProxy, ApiProxyResult } from '@/lib/proxy/ApiProxy'
import { NextRequest, NextResponse } from 'next/server'

export class ApiCspProxy implements ApiProxy {
	public apply(_request: NextRequest, response: NextResponse): ApiProxyResult {
		const csp: string = [
			"default-src 'self'",
			"script-src 'self' 'unsafe-inline'",
			"style-src 'self' 'unsafe-inline'",
			"img-src 'self' data: https:",
			"font-src 'self' data:",
			"connect-src 'self' https://*.cloudflarestorage.com",
		].join('; ')
		response.headers.set('Content-Security-Policy', csp)

		return { earlyReturn: false, result: response }
	}
}
