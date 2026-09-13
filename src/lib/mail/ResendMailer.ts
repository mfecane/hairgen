import { Mailer } from '@/lib/mail/Mailer'

type ResendEmailPayload = {
	from: string
	to: string[]
	subject: string
	text: string
}

// to env
const RESEND_API_URL: string = 'https://api.resend.com/emails'

export class ResendMailer implements Mailer {
	private readonly apiKey: string
	private readonly defaultFrom: string

	public constructor() {
		const key: string | undefined = process.env.RESEND_API_KEY
		if (!key) {
			throw new Error('RESEND_API_KEY environment variable is required for Resend mailer')
		}
		this.apiKey = key
		const from: string | undefined = process.env.SMTP_FROM
		if (!from) {
			throw new Error('SMTP_FROM environment variable is required for Resend mailer')
		}
		this.defaultFrom = from
	}

	public async send(to: string, subject: string, text: string): Promise<void> {
		const payload: ResendEmailPayload = {
			from: this.defaultFrom,
			to: [to],
			subject,
			text,
		}

		const response: Response = await fetch(RESEND_API_URL, {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${this.apiKey}`,
				'Content-Type': 'application/json',
			},
			body: JSON.stringify(payload),
		})

		if (!response.ok) {
			const bodyText: string = await response.text()
			throw new Error(`Resend mail failed: ${response.status} ${bodyText}`)
		}
	}
}
