import { ApiProxy, ApiProxyResult } from '@/lib/proxy/ApiProxy'
import { NextRequest, NextResponse } from 'next/server'

export class ApiProxyPipeline implements ApiProxy {
	private readonly steps: readonly ApiProxy[]

	public constructor(steps: readonly ApiProxy[]) {
		this.steps = steps
	}

	public apply(request: NextRequest, response: NextResponse): ApiProxyResult {
		let current: NextResponse = response
		for (const step of this.steps) {
			const out: ApiProxyResult = step.apply(request, current)
			if (out.earlyReturn) {
				return out
			}
			current = out.result
		}
		return { earlyReturn: false, result: current }
	}
}
