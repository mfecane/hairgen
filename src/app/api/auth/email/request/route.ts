import { ServiceAlias } from '@/di/ServiceAlias'
import { container } from '@/lib/serverBootstrap'

import { db } from '@/db'
import { emailLoginNonces } from '@/db/schema'
import { EmailNonceService } from '@/lib/auth/emailNonce'
import { emailNonceRequestSchema } from '@/lib/auth/emailNonceContract'
import { sendNonceCodeEmail } from '@/lib/auth/sendNonceCodeEmail'
import { Mailer } from '@/lib/mail/Mailer'
import { eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { z } from 'zod'

const GENERIC_SUCCESS_RESPONSE = {
	success: true,
	message: 'If your email can receive messages, we sent a sign-in code.',
} as const

export const runtime = 'nodejs'

export async function POST(request: Request): Promise<Response> {
	try {
		const nonceService = container.resolve<EmailNonceService>(ServiceAlias.EmailNonceService)
		const mailer = container.resolve<Mailer>(ServiceAlias.Mailer)

		const input: unknown = await request.json()
		const parsed = emailNonceRequestSchema.parse(input)

		const now: Date = new Date()
		const nonceCode: string = nonceService.createNonceCode()
		const nonceHash: string = nonceService.hashNonce(parsed.email, nonceCode)
		const nonceId: string = nonceService.createNonceId()
		const expiresAt: Date = nonceService.createExpiresAt(now)

		const green = '\x1b[32m'
		const reset = '\x1b[0m'
		console.log(`Generating nonce for email ${parsed.email} with code ${green}${nonceCode}${reset}`)

		await db.transaction(async (tx) => {
			await tx.delete(emailLoginNonces).where(eq(emailLoginNonces.email, parsed.email))
			await tx.insert(emailLoginNonces).values({
				id: nonceId,
				email: parsed.email,
				nonceHash,
				expiresAt,
				consumedAt: null,
				createdAt: now,
			})
		})

		await sendNonceCodeEmail(mailer, parsed.email, nonceCode, nonceService.getTtlMinutes())

		return NextResponse.json(GENERIC_SUCCESS_RESPONSE, { status: 200 })
	} catch (error) {
		console.error('Email nonce request failed', error)
		if (error instanceof z.ZodError) {
			return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
		}
		return NextResponse.json({ error: 'Failed to process request' }, { status: 500 })
	}
}
