import { ServiceAlias } from '@/di/ServiceAlias'
import { db, getDb } from '@/db'
import { emailLoginNonces, users } from '@/db/schema'
import { EmailNonceService } from '@/lib/auth/emailNonce'
import { pickRandomDumbUserName } from '@/lib/auth/nameUtils'
import { container } from '@/lib/serverBootstrap'
import { DrizzleAdapter } from '@auth/drizzle-adapter'
import { and, desc, eq, gt, isNull } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { NextAuthConfig } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import GoogleProvider from 'next-auth/providers/google'

// Validate required environment variables (only at runtime, not during build)
function validateEnv() {
	const secret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET
	if (!secret) {
		throw new Error('AUTH_SECRET or NEXTAUTH_SECRET environment variable is required')
	}

	if (!process.env.NEXTAUTH_URL && !process.env.AUTH_URL) {
		throw new Error('NEXTAUTH_URL or AUTH_URL environment variable is required')
	}

	if (!process.env.AUTH_GOOGLE_ID?.trim()) {
		throw new Error('AUTH_GOOGLE_ID environment variable is required')
	}

	if (!process.env.AUTH_GOOGLE_SECRET?.trim()) {
		throw new Error('AUTH_GOOGLE_SECRET environment variable is required')
	}
}

if (typeof window === 'undefined' && process.env.NEXT_PHASE !== 'phase-production-build') {
	validateEnv()
}

const emailNonceService = container.resolve<EmailNonceService>(ServiceAlias.EmailNonceService)

const providers: NextAuthConfig['providers'] = [
	GoogleProvider({
		clientId: process.env.AUTH_GOOGLE_ID!,
		clientSecret: process.env.AUTH_GOOGLE_SECRET!,
		// Google verifies email ownership before issuing an ID token (asserted via
		// `profile.email_verified`, checked in the `signIn` callback below), so it's safe to
		// attach a Google sign-in to an existing user with the same email instead of erroring
		// with OAuthAccountNotLinked. This lets an email-code user "connect" Google implicitly
		// just by signing in with it once.
		allowDangerousEmailAccountLinking: true,
	}),
	CredentialsProvider({
		id: 'dev-bypass',
		name: 'Dev bypass',
		credentials: {
			userId: { label: 'User id', type: 'text' },
		},
		async authorize(credentials) {
			if (process.env.NODE_ENV !== 'development') {
				throw new Error('Dev bypass is only available in development')
			}
			if (!credentials?.userId) {
				throw new Error('User id is required')
			}

			const [user] = await db
				.select()
				.from(users)
				.where(eq(users.id, String(credentials.userId)))
				.limit(1)
			if (!user) {
				throw new Error('User not found')
			}
			if (user.deletedAt != null) {
				throw new Error('Account deleted')
			}

			return {
				id: user.id,
				email: user.email,
				name: user.name,
				image: user.image,
			}
		},
	}),
	CredentialsProvider({
		id: 'email-nonce',
		name: 'Email code',
		credentials: {
			email: { label: 'Email', type: 'email' },
			code: { label: 'Code', type: 'text' },
		},
		async authorize(credentials) {
			if (!credentials?.email) {
				throw new Error('Email is required')
			}
			if (!credentials?.code) {
				throw new Error('Code is required')
			}

			const email: string = String(credentials.email).trim().toLowerCase()
			const code: string = String(credentials.code).trim()
			const nonceHash: string = emailNonceService.hashNonce(email, code)
			const now: Date = new Date()

			const user = await db.transaction(async (tx) => {
				const [nonceRecord] = await tx
					.select()
					.from(emailLoginNonces)
					.where(
						and(
							eq(emailLoginNonces.email, email),
							eq(emailLoginNonces.nonceHash, nonceHash),
							isNull(emailLoginNonces.consumedAt),
							gt(emailLoginNonces.expiresAt, now)
						)
					)
					.orderBy(desc(emailLoginNonces.createdAt))
					.limit(1)

				if (!nonceRecord) {
					throw new Error('Invalid or expired code')
				}

				await tx
					.update(emailLoginNonces)
					.set({ consumedAt: now })
					.where(and(eq(emailLoginNonces.id, nonceRecord.id), isNull(emailLoginNonces.consumedAt)))

				const [existingUser] = await tx.select().from(users).where(eq(users.email, email)).limit(1)
				if (existingUser) {
					if (existingUser.deletedAt != null) {
						throw new Error('Account deleted')
					}
					return existingUser
				}

				const userId: string = nanoid(21)
				const placeholderName: string = pickRandomDumbUserName()
				await tx.insert(users).values({
					id: userId,
					email,
					name: placeholderName,
					emailVerified: now,
				})

				const [createdUser] = await tx.select().from(users).where(eq(users.id, userId)).limit(1)
				if (!createdUser) {
					throw new Error('Failed to create account')
				}
				return createdUser
			})

			return {
				id: user.id,
				email: user.email,
				name: user.name,
				image: user.image,
			}
		},
	}),
]

export const authConfig = {
	adapter: DrizzleAdapter(getDb()),
	secret: process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET || 'dummy-secret-for-build',
	trustHost: true, // Trust the host header (useful for Docker/proxy setups)
	providers,
	pages: {
		signIn: '/auth/gate',
		error: '/auth/gate',
	},
	events: {
		async createUser({ user }) {
			const trimmedName: string | undefined = user.name?.trim()
			const displayName: string = trimmedName ? trimmedName : pickRandomDumbUserName()
			await db
				.update(users)
				.set({
					name: displayName,
					updatedAt: new Date(),
				})
				.where(eq(users.id, user.id!))
		},
	},
	callbacks: {
		async signIn({ user, account, profile }) {
			if (account?.provider === 'google' && profile?.email_verified !== true) {
				// allowDangerousEmailAccountLinking trusts Google's email as proof of ownership;
				// refuse to link/create when Google itself hasn't verified it.
				return false
			}
			if (!user?.id) {
				return true
			}
			const [row] = await db
				.select({ deletedAt: users.deletedAt })
				.from(users)
				.where(eq(users.id, user.id))
				.limit(1)
			if (!row) {
				return true
			}
			if (row.deletedAt != null) {
				return false
			}
			return true
		},
		async session({ session, token }) {
			if (session.user && token) {
				session.user.id = token.sub as string
				session.user.email = token.email as string
				session.user.name = token.name as string
				session.user.image = token.picture as string
			}
			return session
		},
		async jwt({ token, user }) {
			if (user) {
				token.sub = user.id
				token.email = user.email
				token.name = user.name
				token.picture = user.image
			}
			if (token.sub) {
				const [row] = await db
					.select({ deletedAt: users.deletedAt })
					.from(users)
					.where(eq(users.id, token.sub as string))
					.limit(1)
				if (row && row.deletedAt != null) {
					return { ...token, exp: 0 }
				}
			}
			return token
		},
	},
	session: {
		strategy: 'jwt', // Use JWT for MVP (simpler than database sessions)
		maxAge: 30 * 24 * 60 * 60, // 30 days
	},
	debug: process.env.NODE_ENV === 'development',
} satisfies NextAuthConfig
