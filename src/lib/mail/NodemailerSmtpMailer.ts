import { Mailer } from '@/lib/mail/Mailer'
import nodemailer from 'nodemailer'

export class NodemailerSmtpMailer implements Mailer {
	private readonly transporter: ReturnType<typeof nodemailer.createTransport>

	public constructor() {
		const port: number = Number(process.env.SMTP_PORT)
		this.transporter = nodemailer.createTransport({
			host: process.env.SMTP_HOST,
			port,
			secure: port === 465,
		})
	}

	public async send(to: string, subject: string, text: string): Promise<void> {
		await this.transporter.sendMail({
			from: process.env.SMTP_FROM,
			to,
			subject,
			text,
		})
	}
}
