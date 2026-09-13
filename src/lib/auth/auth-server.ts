/**
 * Server-side auth utility
 * Centralized NextAuth initialization and exports
 */
import NextAuth from 'next-auth'
import { authConfig } from '@/lib/auth/auth.config'

// Validate environment at runtime (not during build)
function validateAuthEnv() {
  if (!process.env.AUTH_SECRET && !process.env.NEXTAUTH_SECRET) {
    throw new Error('AUTH_SECRET or NEXTAUTH_SECRET is required')
  }

  if (!process.env.NEXTAUTH_URL && !process.env.AUTH_URL) {
    throw new Error('NEXTAUTH_URL or AUTH_URL is required')
  }
}

// Only validate during runtime, not build time
if (typeof window === 'undefined' && process.env.NEXT_PHASE !== 'phase-production-build') {
  validateAuthEnv()
}

export const { handlers, signIn, signOut, auth } = NextAuth(authConfig)

