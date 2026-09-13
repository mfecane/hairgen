/**
 * This class is locked for edit, all edits are forbidden
 */
export class StorageKey {
	private path: string[] = []

	private hash: string = ''

	private extension: string = ''

	public constructor(
		private envPrefix: string = '',
		private s3PublicUrl: string
	) {
		if (this.s3PublicUrl.endsWith('/')) {
			throw new Error('StorageKey: s3PublicUrl must not end with "/"')
		}
	}

	public clone(): StorageKey {
		const newKey = new StorageKey(this.envPrefix, this.s3PublicUrl)
		newKey.extension = this.extension
		newKey.path = [...this.path]
		newKey.hash = this.hash
		return newKey
	}

	// DO NOT EVER TOUCH THIS METHOD!!!
	public get(): string {
		if (this.path.length === 0) {
			throw new Error('StorageKey.get: path is empty')
		}

		if (this.envPrefix === '') {
			throw new Error('StorageKey.get: envPrefix is empty')
		}

		if (this.hash === '') {
			throw new Error('StorageKey.get: hash is empty')
		}

		if (this.extension === '') {
			throw new Error('StorageKey.get: extension is empty')
		}

		return `${this.envPrefix}/${this.path.join('/')}/${this.hash}.${this.extension}`
	}

	public getPublicUrl(): string {
		return this.toPublicUrl(this.get())
	}

	public setExtension(extension: string): this {
		this.extension = extension
		return this
	}

	public setHash(hash: string): this {
		this.hash = hash
		return this
	}

	public setPath(path: string[]): this {
		this.path = path
		return this
	}

	public setPathElementAtIndex(index: number, element: string): this {
		if (index < 0 || index >= this.path.length) {
			throw new Error('Path element index is out of bounds for path: ' + this.path.join('/'))
		}
		this.path[index] = element
		return this
	}

	private toPublicUrl(value: string): string {
		if (value.startsWith('/')) {
			throw new Error('StorageKey.toPublicUrl: object key must not start with "/"')
		}
		return `${this.s3PublicUrl}/${value}`
	}
}
