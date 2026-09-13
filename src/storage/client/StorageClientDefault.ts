import { processImageToBothSizes } from '@/lib/imageSharpProcessing'
import { StorageClient } from '@/storage/client/StorageClient'
import { ImageSizeVariant } from '@/storage/ImageSizeVariant'
import { StorageKey } from '@/storage/key/StorageKey'
import { StorageKeyFactory } from '@/storage/key/StorageKeyFactory'
import { DeleteObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { Optional } from 'typescript-optional'

export abstract class StorageClientDefault implements StorageClient {
	protected readonly s3Client: S3Client

	protected readonly defaultBucket: string

	protected readonly bucketExistsChecked = new Set<string>()

	protected constructor(protected readonly storageKeyFactory: StorageKeyFactory) {
		const s3Endpoint = Optional.ofNullable(process.env.S3_ENDPOINT).orElseThrow(
			() => new Error('S3_ENDPOINT is not configured')
		)
		const s3AccessKey = Optional.ofNullable(process.env.S3_ACCESS_KEY).orElseThrow(
			() => new Error('S3_ACCESS_KEY is not configured')
		)
		const s3SecretKey = Optional.ofNullable(process.env.S3_SECRET_KEY).orElseThrow(
			() => new Error('S3_SECRET_KEY is not configured')
		)
		this.defaultBucket = Optional.ofNullable(process.env.S3_BUCKET).orElseThrow(
			() => new Error('S3_BUCKET is not configured')
		)

		this.s3Client = new S3Client({
			endpoint: s3Endpoint,
			region: 'auto',
			credentials: {
				accessKeyId: s3AccessKey,
				secretAccessKey: s3SecretKey,
			},
			forcePathStyle: true,
		})
	}

	public async deleteFile(key: string, bucket?: string): Promise<void> {
		const targetBucket = bucket || this.defaultBucket
		await this.s3Client.send(
			new DeleteObjectCommand({
				Bucket: targetBucket,
				Key: key,
			})
		)
	}

	public async listFiles(prefix?: string, bucket?: string): Promise<string[]> {
		const targetBucket = bucket || this.defaultBucket
		const allKeys: string[] = []
		let continuationToken: string | undefined

		do {
			const command = new ListObjectsV2Command({
				Bucket: targetBucket,
				Prefix: prefix,
				ContinuationToken: continuationToken,
			})

			const response = await this.s3Client.send(command)

			if (response.Contents) {
				for (const object of response.Contents) {
					if (object.Key) {
						allKeys.push(object.Key)
					}
				}
			}

			continuationToken = response.NextContinuationToken
		} while (continuationToken)

		return allKeys
	}

	public async uploadObject(
		key: StorageKey,
		body: Buffer | Uint8Array | Blob,
		contentType: string,
		bucket?: string
	): Promise<StorageKey> {
		const targetBucket = bucket || this.defaultBucket
		await this.ensureBucketExists(targetBucket)

		const buffer = body instanceof Blob ? Buffer.from(await body.arrayBuffer()) : body

		await this.s3Client.send(
			new PutObjectCommand({
				Bucket: targetBucket,
				Key: key.get(),
				Body: buffer,
				ContentType: contentType,
			})
		)

		return key
	}

	protected abstract ensureBucketExists(bucket: string): Promise<void>

	public async uploadImageWithPreview(key: StorageKey, image: Buffer | Uint8Array | Blob): Promise<StorageKey> {
		let buffer: Buffer
		if (image instanceof Blob) {
			buffer = Buffer.from(await image.arrayBuffer())
		} else if (Buffer.isBuffer(image)) {
			buffer = image
		} else {
			buffer = Buffer.from(image)
		}
		const { original, small } = await processImageToBothSizes(buffer)
		const originalKey = key.clone()
		originalKey.setPathElementAtIndex(3, ImageSizeVariant.ORIGINAL)
		const smallKey = key.clone()
		smallKey.setPathElementAtIndex(3, ImageSizeVariant.SMALL)
		await Promise.all([
			this.uploadObject(originalKey, original, 'image/webp'),
			this.uploadObject(smallKey, small, 'image/webp'),
		])
		return originalKey
	}

	public async uploadProjectGlb(
		projectId: string,
		hash: string,
		model: Buffer | Uint8Array | Blob,
		contentType: 'model/gltf-binary' | 'model/gltf+json' = 'model/gltf-binary'
	): Promise<void> {
		const key = this.storageKeyFactory.createProjectGlbKey(projectId, hash)
		await this.uploadObject(key, model, contentType)
	}

	public getProjectGlbUrl(projectId: string, hash: string): StorageKey {
		return this.storageKeyFactory.createProjectGlbKey(projectId, hash)
	}

	public async uploadUserAvatar(userId: string, hash: string, image: Buffer | Uint8Array | Blob): Promise<void> {
		const key = this.storageKeyFactory.createUserAvatarKey(userId, hash)
		await this.uploadObject(key, image, 'image/webp')
	}

	public getUserAvatarUrl(userId: string, hash: string): StorageKey {
		return this.storageKeyFactory.createUserAvatarKey(userId, hash)
	}
}
