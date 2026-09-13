export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import '@/lib/serverBootstrap'

import { handlers } from '@/lib/auth/auth-server'
import { NextRequest } from 'next/server'

function logAuthRequest(req: Request, bodyText?: string): void {
	const url = new URL(req.url)
	const params = Object.fromEntries(url.searchParams.entries())
	console.log('[auth][nextauth]', {
		method: req.method,
		pathname: url.pathname,
		params,
		bodyText,
	})
}

export async function GET(req: NextRequest): Promise<Response> {
	logAuthRequest(req)
	return handlers.GET(req)
}

export async function POST(req: NextRequest): Promise<Response> {
	const bodyText = await req.clone().text()
	logAuthRequest(req, bodyText)
	return handlers.POST(req)
}

