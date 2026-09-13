/**
 * Image hash utilities
 * Stores hash in database, resolves to full paths (original/small) in frontend
 */

import { randomBytes } from 'crypto'
import { IMAGE_CONFIG } from '@/constants'

/**
 * Generate a random hash string for image identification
 * Used as the unique identifier stored in database
 * Returns 16 hex characters (64 bits, sufficient for uniqueness)
 * Image content is not required because the identifier is intentionally random.
 */
export function generateImageHash(): string {
	return randomBytes(8).toString('hex')
}

/**
 * Resolve hash to storage path
 * @param hash - Image hash (stored in database)
 * @param basePath - Base path (e.g., "designs/{designId}" or "chats/{conversationId}")
 * @param size - 'original' or 'small'
 * @returns Full storage path
 */
export function resolveImagePath(hash: string, basePath: string, size: 'original' | 'small' = 'original'): string {
	const subdir = size === 'small' ? IMAGE_CONFIG.SMALL_SUBDIR : IMAGE_CONFIG.ORIGINAL_SUBDIR
	return `${basePath}/${subdir}/${hash}.webp`
}

/**
 * Extract hash from a storage path
 * @param path - Storage path (e.g., "designs/{designId}/original/{hash}.webp")
 * @returns Hash or null if path is invalid
 */
export function extractHashFromPath(path: string): string | null {
	// Match pattern: {basePath}/{subdir}/{hash}.webp (hash is 16 hex chars)
	const match = path.match(/\/(original|small)\/([a-f0-9]{16})\.webp$/)
	return match ? match[2] : null
}

/**
 * Get both paths (original and small) from a hash
 * @param hash - Image hash
 * @param basePath - Base path
 * @returns Object with original and small paths
 */
export function getImagePaths(hash: string, basePath: string): { original: string; small: string } {
	return {
		original: resolveImagePath(hash, basePath, 'original'),
		small: resolveImagePath(hash, basePath, 'small'),
	}
}
