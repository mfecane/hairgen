import { ServiceAlias } from '@/di/ServiceAlias'
import { EmailNonceService } from '@/lib/auth/emailNonce'
import { Container } from '@/lib/di/container'
import { EnvironmentResolver } from '@/lib/EnvironmentResolver'
import { MailerFactory } from '@/lib/mail/MailerFactory'
import { StorageClientFactory } from '@/storage/client/StorageClientFactory'
import { StorageKeyFactory } from '@/storage/key/StorageKeyFactory'

export function registerServices(container: Container): void {
	container.registerSingleton(ServiceAlias.EnvironmentResolver, {
		useClass: EnvironmentResolver,
	})

	container.registerSingleton(ServiceAlias.StorageKeyFactory, {
		useFactory: (c) => new StorageKeyFactory(c.resolve(ServiceAlias.EnvironmentResolver)),
	})

	container.registerSingleton(ServiceAlias.StorageClient, {
		useFactory: (c) => new StorageClientFactory(c).create(),
	})

	container.registerSingleton(ServiceAlias.Mailer, {
		useFactory: () => new MailerFactory().getMailer(),
	})

	container.registerSingleton(ServiceAlias.EmailNonceService, {
		useClass: EmailNonceService,
	})
}
