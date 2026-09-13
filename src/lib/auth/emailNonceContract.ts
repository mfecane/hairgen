import { z } from 'zod'

export const emailNonceRequestSchema = z.object({
	email: z.string().trim().toLowerCase().email(),
})

export const emailNonceRequestSuccessSchema = z.object({
	success: z.literal(true),
	message: z.string(),
})

export const emailNonceVerifySchema = z.object({
	email: z.string().trim().toLowerCase().email(),
	code: z.string().trim().min(6).max(6),
})

export const emailNonceVerifySuccessSchema = z.object({
	success: z.literal(true),
	redirectTo: z.string(),
})
