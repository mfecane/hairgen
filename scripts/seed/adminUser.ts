import { db } from '@/db'
import { users } from '@/db/schema'
import { pickRandomDumbUserName } from '@/lib/auth/nameUtils'
import { createSeededIdGenerator } from '@/lib/math/random'

export const ADMIN_EMAIL = 'aaliapkin@gmail.com'

// Deterministic (not random) so the admin user gets the same id every reseed - otherwise a
// `docker compose down -v` reset silently orphans any already-issued JWT session, since the
// cookie's user.id no longer matches a row and every mutation 500s on the FK constraint.
const generateAdminUserId = createSeededIdGenerator(ADMIN_EMAIL, { namespace: 'user' })

export async function addAdminUser(): Promise<string> {
	const [user] = await db
		.insert(users)
		.values({
			id: generateAdminUserId(),
			email: ADMIN_EMAIL,
			emailVerified: new Date(),
			name: pickRandomDumbUserName(),
		})
		.onConflictDoUpdate({
			target: users.email,
			set: { emailVerified: new Date() },
		})
		.returning({ id: users.id })
	console.log(`✓ Admin user ready: ${ADMIN_EMAIL}`)
	return user.id
}
