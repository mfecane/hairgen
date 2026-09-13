import { EnvironmentResolver } from '@/lib/EnvironmentResolver'
import { EnvironmentType } from '@/lib/EnvironmentType'
import { BakeMapKind } from '@/lib/hair/bake/HairCardBakeTypes'
import { ImageSizeVariant } from '@/storage/ImageSizeVariant'
import { StorageKey } from '@/storage/key/StorageKey'
import { Optional } from 'typescript-optional'

export class StorageKeyFactory {
	private readonly environmentType: EnvironmentType

	private readonly seedKey = process.env.NEXT_PUBLIC_SEED_KEY ?? ''

	private readonly s3PublicUrl = Optional.ofNullable(
		process.env.NEXT_PUBLIC_S3_PUBLIC_URL || process.env.S3_PUBLIC_URL
	).orElseThrow(() => new Error('S3_PUBLIC_URL and NEXT_PUBLIC_S3_PUBLIC_URL are not configured'))

	private envPrefix: string = ''

	public constructor(environmentResolver: EnvironmentResolver) {
		this.environmentType = environmentResolver.getEnvironmentKey()
		this.envPrefix = this.getEnvPrefix()
	}

	public createUserAvatarKey(userId: string, hash: string): StorageKey {
		const key = new StorageKey(this.envPrefix, this.s3PublicUrl)
		key.setPath(['user', userId, 'avatar'])
		key.setHash(hash)
		key.setExtension('webp')
		return key
	}

	public createProjectGlbKey(projectId: string, hash: string): StorageKey {
		const key = new StorageKey(this.envPrefix, this.s3PublicUrl)
		key.setPath(['project', projectId, 'model'])
		key.setHash(hash)
		key.setExtension('glb')
		return key
	}

	/** One project-wide hair texture map, content-addressed by the rendered PNG's bytes. */
	public createHairCardBakeMapKey(projectId: string, mapKind: BakeMapKind, hash: string): StorageKey {
		const key = new StorageKey(this.envPrefix, this.s3PublicUrl)
		key.setPath(['project', projectId, 'hairCards', 'bake', mapKind])
		key.setHash(hash)
		key.setExtension('png')
		return key
	}

	/**
	 * For staged objects only, meant to be discarded (e.g. transient upload processing).
	 * Hardcodes the 'tmp' prefix on purpose, ignoring the environment prefix, so anything
	 * written through this key is NOT durable storage. Never use this for a permanent,
	 * user-facing object - add a dedicated create*Key method instead.
	 */
	public createRawObjectKey(path: string[], hash: string, extension: string): StorageKey {
		const key = new StorageKey('tmp', this.s3PublicUrl)
		key.setPath(path)
		key.setHash(hash)
		key.setExtension(extension)
		return key
	}

	private getEnvPrefix(): string {
		let prefix = ''

		switch (this.environmentType) {
			case EnvironmentType.Preview:
				prefix = 'dev'
				break
			case EnvironmentType.Production:
				prefix = 'prod'
				break
			case EnvironmentType.Local:
				prefix = 'dev'
				break
		}

		if (this.environmentType === EnvironmentType.Preview || this.environmentType === EnvironmentType.Local) {
			return (prefix = `${prefix}/${this.seedKey}`)
		}

		return prefix
	}
}
