import { ApiProxy, ApiProxyResult } from '@/lib/proxy/ApiProxy'
import { NextRequest, NextResponse } from 'next/server'

export class ApiCorsProxy implements ApiProxy {
	public apply(request: NextRequest, response: NextResponse): ApiProxyResult {
		const allowedOrigin: string = process.env.ALLOWED_ORIGINS?.split(',')[0] || '*'

		response.headers.set('Access-Control-Allow-Origin', allowedOrigin)
		response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS')
		response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization')
		response.headers.set('Access-Control-Max-Age', '86400')

		if (request.method === 'OPTIONS') {
			return {
				earlyReturn: true,
				result: new NextResponse(null, { status: 204, headers: response.headers }),
			}
		}

		return { earlyReturn: false, result: response }
	}
}
