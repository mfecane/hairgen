/**
 * Server-side image processing (sharp). Used by seed, API routes, and storage uploads.
 */

import sharp from 'sharp'
import { IMAGE_CONFIG } from '@/constants'

export async function processImageToWebP(
	inputPath: string | Buffer,
	maxWidth: number,
	quality: number = IMAGE_CONFIG.FULL_QUALITY
): Promise<Buffer> {
	const image = sharp(inputPath)
	const metadata = await image.metadata()

	if (!metadata.width || !metadata.height) {
		throw new Error('INVALID_IMAGE_DIMENSIONS')
	}

	const scale = Math.min(1, maxWidth / Math.max(metadata.width, metadata.height))
	const targetWidth = Math.round(metadata.width * scale)
	const targetHeight = Math.round(metadata.height * scale)

	const processed = await image
		.resize(targetWidth, targetHeight, {
			fit: 'inside',
			withoutEnlargement: true,
		})
		.webp({ quality: Math.round(quality * 100) })
		.toBuffer()

	return processed
}

export async function processImageToOriginal(inputPath: string | Buffer): Promise<Buffer> {
	return processImageToWebP(inputPath, IMAGE_CONFIG.FULL_WIDTH, IMAGE_CONFIG.FULL_QUALITY)
}

export async function processImageToSmall(inputPath: string | Buffer): Promise<Buffer> {
	return processImageToWebP(inputPath, IMAGE_CONFIG.PREVIEW_WIDTH, IMAGE_CONFIG.SMALL_QUALITY)
}

export async function processImageToBothSizes(inputPath: string | Buffer): Promise<{
	original: Buffer
	small: Buffer
}> {
	const [original, small] = await Promise.all([
		processImageToOriginal(inputPath),
		processImageToSmall(inputPath),
	])

	return { original, small }
}
