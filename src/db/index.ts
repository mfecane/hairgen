import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import * as schema from './schema'

let pool: Pool | null = null
let dbInstance: ReturnType<typeof drizzle> | null = null

export function getDb() {
  // Only initialize during runtime, not at build time
  if (typeof window !== 'undefined') {
    throw new Error('Database can only be accessed on the server')
  }

  if (dbInstance) {
    return dbInstance
  }

  const connectionString = process.env.DATABASE_URL

  // During build time, DATABASE_URL might not be set, so we'll create a dummy connection
  // that will fail gracefully when actually used
  if (!connectionString) {
    // Check if we're in build mode (Next.js sets this)
    if (process.env.NEXT_PHASE === 'phase-production-build' || process.env.NODE_ENV === 'production' && !process.env.DATABASE_URL) {
      // Return a proxy that throws when methods are called
      return new Proxy({} as ReturnType<typeof drizzle>, {
        get() {
          throw new Error('DATABASE_URL environment variable is not set. Database operations are not available during build.')
        }
      }) as ReturnType<typeof drizzle>
    }
    throw new Error('DATABASE_URL environment variable is not set')
  }

  pool = new Pool({
    connectionString,
    // Add connection options
    max: 10, // max connections in pool
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000, // 10 second timeout
  })

  // Log connection errors
  pool.on('error', (err) => {
    console.error('Unexpected error on idle client', err)
  })

  dbInstance = drizzle(pool, { schema })
  return dbInstance
}

export const db = new Proxy({} as ReturnType<typeof drizzle>, {
  get(_target, prop) {
    return getDb()[prop as keyof ReturnType<typeof drizzle>]
  }
})
export type Database = typeof db
