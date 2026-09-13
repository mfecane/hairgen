export const runtime = 'nodejs'

import '@/lib/serverBootstrap'

import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth/auth-server'
import { db } from '@/db'
import { accounts } from '@/db/schema'
import { apiError } from '@/lib/api/errors'
import { and, eq } from 'drizzle-orm'

/**
 * GET /api/user/connections
 * List OAuth providers linked to the authenticated user (e.g. Google).
 */
export async function GET() {
	const session = await auth()
	if (!session?.user?.id) {
		return Response.json(apiError('UNAUTHENTICATED'), { status: 401 })
	}

	const rows = await db
		.select({ provider: accounts.provider })
		.from(accounts)
		.where(eq(accounts.userId, session.user.id))

	return Response.json({ providers: rows.map((row) => row.provider) })
}

/**
 * DELETE /api/user/connections?provider=google
 * Unlink an OAuth provider from the authenticated user. Email-code sign-in stays available
 * regardless (it matches by email, not by an `account` row), so this never locks a user out.
 */
export async function DELETE(request: NextRequest) {
	const session = await auth()
	if (!session?.user?.id) {
		return Response.json(apiError('UNAUTHENTICATED'), { status: 401 })
	}

	const provider = request.nextUrl.searchParams.get('provider')
	if (!provider) {
		return Response.json(apiError('MISSING_REQUIRED_FIELDS', { field: 'provider' }), { status: 400 })
	}

	const deleted = await db
		.delete(accounts)
		.where(and(eq(accounts.userId, session.user.id), eq(accounts.provider, provider)))
		.returning({ provider: accounts.provider })

	if (deleted.length === 0) {
		return Response.json(apiError('NOT_FOUND'), { status: 404 })
	}

	return Response.json({ success: true })
}
