import { NextRequest, NextResponse } from 'next/server'

export interface ApiProxyResult {
	earlyReturn: boolean
	result: NextResponse
}

export interface ApiProxy {
	apply(request: NextRequest, response: NextResponse): ApiProxyResult
}
