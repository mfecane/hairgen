import { ServiceAlias } from '@/di/ServiceAlias'
import { container } from '@/lib/serverBootstrap'

import { db } from '@/db'
import { emailLoginNonces } from '@/db/schema'
import { EmailNonceService } from '@/lib/auth/emailNonce'
import { emailNonceVerifySchema } from '@/lib/auth/emailNonceContract'
import { and, desc, eq, gt, isNull } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { z } from 'zod'

const VERIFY_SUCCESS_RESPONSE = {
	success: true,
	redirectTo: '/',
} as const

export const runtime = 'nodejs'

export async function POST(request: Request): Promise<Response> {
	try {
		const nonceService = container.resolve<EmailNonceService>(ServiceAlias.EmailNonceService)

		const input: unknown = await request.json()
		const parsed = emailNonceVerifySchema.parse(input)
		const now: Date = new Date()
		const expectedNonceHash: string = nonceService.hashNonce(parsed.email, parsed.code)

		const [nonceRecord] = await db
			.select()
			.from(emailLoginNonces)
			.where(
				and(
					eq(emailLoginNonces.email, parsed.email),
					eq(emailLoginNonces.nonceHash, expectedNonceHash),
					isNull(emailLoginNonces.consumedAt),
					gt(emailLoginNonces.expiresAt, now)
				)
			)
			.orderBy(desc(emailLoginNonces.createdAt))
			.limit(1)

		if (!nonceRecord) {
			return NextResponse.json({ error: 'Invalid or expired code' }, { status: 400 })
		}

		await db
			.update(emailLoginNonces)
			.set({ consumedAt: now })
			.where(eq(emailLoginNonces.id, nonceRecord.id))

		return NextResponse.json(VERIFY_SUCCESS_RESPONSE, { status: 200 })
	} catch (error) {
		console.error('Email nonce verify failed', error)
		if (error instanceof z.ZodError) {
			return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
		}
		return NextResponse.json({ error: 'Failed to verify code' }, { status: 500 })
	}
}
