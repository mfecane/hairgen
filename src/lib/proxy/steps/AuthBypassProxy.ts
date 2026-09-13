import { ApiProxy, ApiProxyResult } from '@/lib/proxy/ApiProxy'
import { NextRequest, NextResponse } from 'next/server'

export class AuthBypassProxy implements ApiProxy {
	public apply(request: NextRequest, response: NextResponse): ApiProxyResult {
		if (this.isAuthApiPath(request.nextUrl.pathname)) {
			return { earlyReturn: true, result: response }
		}
		return { earlyReturn: false, result: response }
	}

	private isAuthApiPath(pathname: string): boolean {
		return pathname === '/api/auth' || pathname.startsWith('/api/auth/')
	}
}
