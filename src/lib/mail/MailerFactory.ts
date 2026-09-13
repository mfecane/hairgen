import { Mailer } from '@/lib/mail/Mailer'
import { NodemailerSmtpMailer } from '@/lib/mail/NodemailerSmtpMailer'
import { ResendMailer } from '@/lib/mail/ResendMailer'

export class MailerFactory {
	private mailer: Mailer | null = null

	public getMailer(): Mailer {
		if (this.mailer !== null) {
			return this.mailer
		}
		this.mailer = this.createMailer()
		return this.mailer
	}

	private createMailer(): Mailer {
		if (process.env.NODE_ENV === 'production') {
			return new ResendMailer()
		}
		return new NodemailerSmtpMailer()
	}
}
