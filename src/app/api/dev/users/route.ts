export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import '@/lib/serverBootstrap'

import { db } from '@/db'
import { users } from '@/db/schema'
import { desc } from 'drizzle-orm'

export async function GET(): Promise<Response> {
	if (process.env.NODE_ENV !== 'development') {
		return Response.json({ error: 'NOT_ALLOWED' }, { status: 403 })
	}

	const rows = await db
		.select({
			id: users.id,
			email: users.email,
			name: users.name,
			avatar: users.avatar,
		})
		.from(users)
		.orderBy(desc(users.email))

	return Response.json({ users: rows })
}
