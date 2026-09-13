import { execSync } from 'child_process'

/**
 * Always pushes the current Drizzle schema, rather than only when a whole table is missing (the
 * old `SELECT 1 FROM "user"` probe only ever caught a fully-empty database - it happily reported
 * "schema exists" when tables were present but missing newly-added columns, e.g. the groom editor's
 * `groom`/`bakedMaps` columns, silently leaving the DB stale on every reseed/container recreate).
 * `drizzle-kit push` is itself the up-to-date check - it's a no-op when nothing changed.
 */
export async function ensureSchema(): Promise<void> {
	console.log('Pushing database schema...')
	try {
		execSync('npm run db:push', { cwd: process.cwd(), stdio: 'inherit', env: process.env })
		console.log('✓ Schema pushed successfully')
	} catch (pushError) {
		console.error('Failed to push schema:', pushError)
		throw new Error('Failed to push database schema. Please run: npm run db:push')
	}
}
