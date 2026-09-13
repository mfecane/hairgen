import { ApiProxyPipeline } from '@/lib/proxy/ApiProxyPipeline'
import { ApiCorsProxy } from '@/lib/proxy/steps/ApiCorsProxy'
import { ApiCspProxy } from '@/lib/proxy/steps/ApiCspProxy'
import { AuthBypassProxy } from '@/lib/proxy/steps/AuthBypassProxy'
import { RateLimitProxy } from '@/lib/proxy/steps/RateLimitProxy'
import { SecurityHeadersProxy } from '@/lib/proxy/steps/SecurityHeadersProxy'
import { NextRequest, NextResponse } from 'next/server'

export const pipeline = new ApiProxyPipeline([
	new SecurityHeadersProxy(),
	new AuthBypassProxy(),
	new ApiCorsProxy(),
	new RateLimitProxy(),
	new ApiCspProxy(),
])

export function proxy(request: NextRequest): NextResponse {
	return pipeline.apply(request, NextResponse.next()).result
}

export const config = {
	// Multipart upload routes are excluded: Next's Node.js proxy runtime clones the
	// request body to share it between proxy and route handler, and an unawaited
	// finalize() in that clone path can hand the route handler a different in-flight
	// request's body/headers under concurrent load (https://github.com/vercel/next.js/issues/85416,
	// fixed upstream but still reproducing on next@16.2.2 here). Retry removing this
	// exclusion next time next is upgraded. The hair-card atlas bake route is multipart for the same
	// reason (it uploads several PNGs in one request - see UploadRateLimitBucket.HairCardBakeUpload,
	// enforced in-handler like user/avatar instead of via RateLimitProxy).
	matcher: ['/api/((?!user/avatar)(?!projects/[^/]+/hair-cards/bake).*)'],
}
