import { Mailer } from '@/lib/mail/Mailer'

const DEFAULT_SUBJECT: string = 'Your hairgen sign-in code'

export async function sendNonceCodeEmail(
	mailer: Mailer,
	email: string,
	code: string,
	expiresInMinutes: number
): Promise<void> {
	const subject: string = DEFAULT_SUBJECT
	const text: string = [
		'Your sign-in code',
		'',
		`Code: ${code}`,
		`This code expires in ${expiresInMinutes} minutes.`,
		'',
		'If you did not request this email, you can ignore it.',
	].join('\n')

	await mailer.send(email, subject, text)
}
