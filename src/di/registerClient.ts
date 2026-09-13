import { ServiceAlias } from '@/di/ServiceAlias'
import { Container } from '@/lib/di/container'
import { EnvironmentResolver } from '@/lib/EnvironmentResolver'
import { StorageKeyFactory } from '@/storage/key/StorageKeyFactory'

export function registerClientServices(container: Container): void {
	container.registerSingleton(ServiceAlias.EnvironmentResolver, {
		useClass: EnvironmentResolver,
	})

	container.registerSingleton(ServiceAlias.StorageKeyFactory, {
		useFactory: (c) => new StorageKeyFactory(c.resolve(ServiceAlias.EnvironmentResolver)),
	})
}
