export const runtime = 'nodejs'

import { db } from '@/db'
import { users } from '@/db/schema'
import { ServiceAlias } from '@/di/ServiceAlias'
import { auth } from '@/lib/auth/auth-server'
import { apiError } from '@/lib/api/errors'
import { container } from '@/lib/serverBootstrap'
import { UploadRateLimitBucket, uploadRateLimiter } from '@/lib/proxy/UploadRateLimiter'
import { StorageClient } from '@/storage/client/StorageClient'
import { StorageKeyFactory } from '@/storage/key/StorageKeyFactory'
import { eq } from 'drizzle-orm'
import { NextRequest } from 'next/server'
import { Optional } from 'typescript-optional'
import { v4 as uuidv4 } from 'uuid'

const MAX_FILE_SIZE = 500 * 1024 // 500KB - aggressive limit for avatars
const ALLOWED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']

/**
 * POST /api/user/avatar
 * Upload avatar to MinIO (raw body; Content-Type must be an allowed image/* type)
 */
export async function POST(req: NextRequest) {
	try {
		const rateLimited = uploadRateLimiter.enforce(req, UploadRateLimitBucket.MediaUpload)
		if (rateLimited) return rateLimited

		const storage = container.resolve<StorageClient>(ServiceAlias.StorageClient)
		const session = await auth()
		if (!session?.user?.id) {
			return Response.json(apiError('UNAUTHENTICATED'), { status: 401 })
		}

		const contentTypeHeader = req.headers.get('content-type')
		if (!contentTypeHeader) {
			return Response.json(apiError('MISSING_CONTENT_TYPE'), { status: 400 })
		}
		const contentType = contentTypeHeader.split(';')[0].trim()
		if (!ALLOWED_TYPES.includes(contentType)) {
			return Response.json(apiError('INVALID_FILE_TYPE'), { status: 400 })
		}

		const arrayBuffer = await req.arrayBuffer()
		if (arrayBuffer.byteLength === 0) {
			return Response.json(apiError('MISSING_FILE'), { status: 400 })
		}

		if (arrayBuffer.byteLength > MAX_FILE_SIZE) {
			return Response.json(apiError('FILE_TOO_LARGE'), { status: 413 })
		}

		// Delete old avatar if exists
		const existingProfile = await db
			.select()
			.from(users)
			.where(eq(users.id, session.user.id))
			.limit(1)

		if (existingProfile.length > 0 && existingProfile[0].avatar) {
			const oldAvatar = existingProfile[0].avatar
			const keyFactory = container.resolve<StorageKeyFactory>(ServiceAlias.StorageKeyFactory)
			let oldKey: string | null = null
			if (oldAvatar.startsWith('http://') || oldAvatar.startsWith('https://')) {
				try {
					const urlObj = new URL(oldAvatar)
					const pathParts = urlObj.pathname.split('/').filter(Boolean)
					const s3Bucket = Optional.ofNullable(process.env.S3_BUCKET).orElseThrow(
						() => new Error('S3_BUCKET is not configured')
					)
					if (pathParts.length >= 2 && pathParts[0] === s3Bucket) {
						oldKey = pathParts.slice(1).join('/')
					}
				} catch (err) {
					console.warn('Failed to parse old avatar URL:', err)
				}
			} else if (oldAvatar.includes('/')) {
				oldKey = oldAvatar
			} else {
				oldKey = keyFactory.createUserAvatarKey(session.user.id, oldAvatar).get()
			}
			if (oldKey) {
				await storage.deleteFile(oldKey).catch((err) => {
					console.warn('Failed to delete old avatar:', err)
				})
			}
		}

		// Upload new avatar
		const hash = uuidv4()
		await storage.uploadUserAvatar(session.user.id, hash, new Uint8Array(arrayBuffer))

		// Update profile with S3 object path (not URL)
		const updateData = {
			avatar: hash,
			updatedAt: new Date(),
		}

		await db
			.update(users)
			.set(updateData)
			.where(eq(users.id, session.user.id))

		return Response.json({ url: storage.getUserAvatarUrl(session.user.id, hash).getPublicUrl(), path: hash })
	} catch (error) {
		const message = error instanceof Error ? error.message : 'UNKNOWN_ERROR'
		const stack = error instanceof Error ? error.stack : undefined
		console.error('[user/avatar] POST error:', message, stack)
		return Response.json(
			{
				error: {
					code: 'UPLOAD_FAILED',
					message: process.env.NODE_ENV === 'development' ? message : undefined,
				},
			},
			{ status: 500 }
		)
	}
}

/**
 * DELETE /api/user/avatar
 * Delete avatar from MinIO
 */
export async function DELETE() {
	try {
		const storage = container.resolve<StorageClient>(ServiceAlias.StorageClient)
		const session = await auth()
		if (!session?.user?.id) {
			return Response.json(apiError('UNAUTHENTICATED'), { status: 401 })
		}

		// Get current profile
		const profile = await db.select().from(users).where(eq(users.id, session.user.id)).limit(1)

		if (profile.length === 0 || !profile[0].avatar) {
			return Response.json(apiError('NO_AVATAR'), { status: 404 })
		}

		const avatarRef = profile[0].avatar
		const keyFactory = container.resolve<StorageKeyFactory>(ServiceAlias.StorageKeyFactory)
		let key: string | null = null
		if (avatarRef.startsWith('http://') || avatarRef.startsWith('https://')) {
			try {
				const urlObj = new URL(avatarRef)
				const pathParts = urlObj.pathname.split('/').filter(Boolean)
				const s3Bucket = Optional.ofNullable(process.env.S3_BUCKET).orElseThrow(
					() => new Error('S3_BUCKET is not configured')
				)
				if (pathParts.length >= 2 && pathParts[0] === s3Bucket) {
					key = pathParts.slice(1).join('/')
				}
			} catch (err) {
				console.warn('Failed to parse avatar URL:', err)
			}
		} else if (avatarRef.includes('/')) {
			key = avatarRef
		} else {
			key = keyFactory.createUserAvatarKey(session.user.id, avatarRef).get()
		}
		if (key) {
			await storage.deleteFile(key).catch((err) => {
				console.warn('Failed to delete avatar from MinIO:', err)
			})
		}

		// Update profile to remove avatar
		await db
			.update(users)
			.set({
				avatar: null,
				updatedAt: new Date(),
			})
			.where(eq(users.id, session.user.id))

		return Response.json({ success: true })
	} catch (error) {
		const message = error instanceof Error ? error.message : 'UNKNOWN_ERROR'
		const stack = error instanceof Error ? error.stack : undefined
		console.error('[user/avatar] DELETE error:', message, stack)
		return Response.json(
			{
				error: {
					code: 'DELETE_FAILED',
					message: process.env.NODE_ENV === 'development' ? message : undefined,
				},
			},
			{ status: 500 }
		)
	}
}
