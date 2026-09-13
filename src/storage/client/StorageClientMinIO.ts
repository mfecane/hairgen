import { StorageClientDefault } from '@/storage/client/StorageClientDefault'
import { StorageKeyFactory } from '@/storage/key/StorageKeyFactory'
import { CreateBucketCommand, HeadBucketCommand, PutBucketPolicyCommand } from '@aws-sdk/client-s3'

/**
 * Docker / localhost MinIO — create bucket + public-read policy when missing.
 */
export class StorageClientMinIO extends StorageClientDefault {
	public constructor(keyFactory: StorageKeyFactory) {
		super(keyFactory)
	}

	protected async ensureBucketExists(bucket: string): Promise<void> {
		if (this.bucketExistsChecked.has(bucket)) return

		try {
			await this.s3Client.send(
				new HeadBucketCommand({
					Bucket: bucket,
				})
			)
			this.bucketExistsChecked.add(bucket)
		} catch (error: unknown) {
			const err = error as { name?: string; $metadata?: { httpStatusCode?: number } }
			if (err.name === 'NotFound' || err.$metadata?.httpStatusCode === 404) {
				try {
					await this.s3Client.send(
						new CreateBucketCommand({
							Bucket: bucket,
						})
					)
					this.bucketExistsChecked.add(bucket)
					await this.setPublicReadPolicy(bucket)
				} catch (createError) {
					try {
						await this.s3Client.send(
							new HeadBucketCommand({
								Bucket: bucket,
							})
						)
						this.bucketExistsChecked.add(bucket)
					} catch {
						throw createError
					}
				}
			} else {
				throw error
			}
		}
	}

	private async setPublicReadPolicy(bucket: string): Promise<void> {
		const policy = {
			Version: '2012-10-17',
			Statement: [
				{
					Effect: 'Allow',
					Principal: { AWS: ['*'] },
					Action: ['s3:GetObject'],
					Resource: [`arn:aws:s3:::${bucket}/*`],
				},
			],
		}

		try {
			await this.s3Client.send(
				new PutBucketPolicyCommand({
					Bucket: bucket,
					Policy: JSON.stringify(policy),
				})
			)
		} catch (error) {
			console.warn(`Failed to set bucket policy for ${bucket} (this is usually fine):`, error)
		}
	}
}
