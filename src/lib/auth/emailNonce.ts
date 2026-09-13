import { createHash, randomInt, randomUUID } from 'crypto'
import { Optional } from 'typescript-optional'

export class EmailNonceService {
	public static readonly NONCE_CODE_LENGTH: number = 6
	public static readonly NONCE_TTL_MINUTES: number = 15

	public createNonceCode(): string {
		const maxExclusive: number = 10 ** EmailNonceService.NONCE_CODE_LENGTH
		const value: number = randomInt(0, maxExclusive)
		return value.toString().padStart(EmailNonceService.NONCE_CODE_LENGTH, '0')
	}

	public createNonceId(): string {
		return randomUUID()
	}

	public createExpiresAt(now: Date): Date {
		return new Date(now.getTime() + EmailNonceService.NONCE_TTL_MINUTES * 60 * 1000)
	}

	public hashNonce(email: string, code: string): string {
		const pepper: string = Optional.ofNullable(process.env.AUTH_EMAIL_NONCE_PEPPER).orElseThrow(
			() => new Error('AUTH_EMAIL_NONCE_PEPPER environment variable is required')
		)
		const normalizedEmail: string = email.trim().toLowerCase()
		return createHash('sha256').update(`${normalizedEmail}:${code}:${pepper}`).digest('hex')
	}

	public getTtlMinutes(): number {
		return EmailNonceService.NONCE_TTL_MINUTES
	}
}
