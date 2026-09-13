import { ImageSizeVariant } from '@/storage/ImageSizeVariant'
import { StorageKey } from '@/storage/key/StorageKey'

/**
 * Abstraction for S3-compatible object storage (MinIO, Cloudflare R2, etc.).
 */
export interface StorageClient {
	/**
	 * Uploads a user avatar for the given content hash.
	 *
	 * @param userId - User id.
	 * @param hash - Version id stored alongside the profile (e.g. UUID).
	 * @param image - Encoded image bytes.
	 */
	uploadUserAvatar(userId: string, hash: string, image: Buffer | Uint8Array | Blob): Promise<void>

	/**
	 * Public HTTPS URL for the avatar object for this user and hash.
	 *
	 * @param userId - User id.
	 * @param hash - Same hash as stored on the profile.
	 */
	getUserAvatarUrl(userId: string, hash: string): StorageKey

	/**
	 * Uploads a project's GLB or GLTF model for the given content hash (raw upload, no image processing).
	 */
	uploadProjectGlb(
		projectId: string,
		hash: string,
		model: Buffer | Uint8Array | Blob,
		contentType?: 'model/gltf-binary' | 'model/gltf+json'
	): Promise<void>

	/**
	 * Public HTTPS URL for a project's GLB model object.
	 */
	getProjectGlbUrl(projectId: string, hash: string): StorageKey

	/**
	 * Uploads an arbitrary object described by a key implementation.
	 *
	 * @param key - Domain or raw key.
	 * @param body - Object body.
	 * @param contentType - MIME type.
	 * @param bucket - Optional bucket override.
	 */
	uploadObject(
		key: StorageKey,
		body: Buffer | Uint8Array | Blob,
		contentType: string,
		bucket?: string
	): Promise<StorageKey>

	/**
	 * Deletes one object by key.
	 *
	 * @param key - Object key in the bucket.
	 * @param bucket - Optional bucket override.
	 */
	deleteFile(key: string, bucket?: string): Promise<void>

	/**
	 * Uploads original and preview sizes for a design image key (implementation-defined layout).
	 *
	 * @param key - Base design key (owner + hash; variants appended internally).
	 * @param image - Source image bytes.
	 */
	uploadImageWithPreview(key: StorageKey, image: Buffer | Uint8Array | Blob): Promise<StorageKey>

	/**
	 * Lists object keys under an optional prefix.
	 *
	 * @param prefix - Key prefix filter.
	 * @param bucket - Optional bucket override.
	 */
	listFiles(prefix?: string, bucket?: string): Promise<string[]>
}
