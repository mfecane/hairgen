// Single source of truth for drizzle configuration
// Used by both frontend and seed (copied to seed on container creation)
// Allow schema path to be overridden via DRIZZLE_SCHEMA_PATH environment variable
// Defaults to `./src/db/schema.ts`
// Override with DRIZZLE_SCHEMA_PATH when needed
import type { Config } from 'drizzle-kit'

const SCHEMA_PATH = process.env.DRIZZLE_SCHEMA_PATH || './src/db/schema.ts'

export default {
  schema: SCHEMA_PATH,
  out: './src/drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
} satisfies Config

