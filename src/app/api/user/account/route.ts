export const runtime = 'nodejs'

import '@/lib/serverBootstrap'

import { auth } from '@/lib/auth/auth-server'
import { db } from '@/db'
import { users } from '@/db/schema'
import { apiError } from '@/lib/api/errors'
import { eq } from 'drizzle-orm'

/**
 * DELETE /api/user/account
 * Soft-delete the authenticated user (sets deletedAt). Row and relations remain for recovery/analytics.
 */
export async function DELETE() {
	try {
		const session = await auth()
		if (!session?.user?.id) {
			return Response.json(apiError('UNAUTHENTICATED'), { status: 401 })
		}

		const now = new Date()
		await db
			.update(users)
			.set({ deletedAt: now, updatedAt: now })
			.where(eq(users.id, session.user.id))

		return Response.json({ success: true })
	} catch (error) {
		const message = error instanceof Error ? error.message : 'UNKNOWN_ERROR'
		const stack = error instanceof Error ? error.stack : undefined
		console.error('[user/account] DELETE error:', message, stack)
		return Response.json(
			{
				error: {
					code: 'INTERNAL_ERROR',
					message: process.env.NODE_ENV === 'development' ? message : undefined,
				},
			},
			{ status: 500 }
		)
	}
}
