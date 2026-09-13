import { ServiceAlias } from '@/di/ServiceAlias'
import { Container } from '@/lib/di/container'
import { EnvironmentResolver } from '@/lib/EnvironmentResolver'
import { EnvironmentType } from '@/lib/EnvironmentType'
import { StorageClient } from '@/storage/client/StorageClient'
import { StorageClientMinIO } from '@/storage/client/StorageClientMinIO'
import { StorageClientR2 } from '@/storage/client/StorageClientR2'
import { StorageKeyFactory } from '@/storage/key/StorageKeyFactory'

export class StorageClientFactory {
	private readonly environmentResolver: EnvironmentResolver
	private readonly storageKeyFactory: StorageKeyFactory

	public constructor(container: Container) {
		this.environmentResolver = container.resolve(ServiceAlias.EnvironmentResolver)
		this.storageKeyFactory = container.resolve(ServiceAlias.StorageKeyFactory)
	}

	public create(): StorageClient {
		const env = this.environmentResolver.getEnvironmentKey()
		switch (env) {
			case EnvironmentType.Preview:
			case EnvironmentType.Production:
				return new StorageClientR2(this.storageKeyFactory)
			case EnvironmentType.Local:
				return new StorageClientMinIO(this.storageKeyFactory)
		}
	}
}
