export const runtime = 'nodejs'

import '@/lib/serverBootstrap'

import { BAKE } from '@/constants'
import { db } from '@/db'
import { projects } from '@/db/schema'
import { ServiceAlias } from '@/di/ServiceAlias'
import { apiError } from '@/lib/api/errors'
import { auth } from '@/lib/auth/auth-server'
import { BakeMapKind, BakedMapsRecord } from '@/lib/hair/bake/HairCardBakeTypes'
import { UploadRateLimitBucket, uploadRateLimiter } from '@/lib/proxy/UploadRateLimiter'
import { container } from '@/lib/serverBootstrap'
import { StorageClient } from '@/storage/client/StorageClient'
import { StorageKeyFactory } from '@/storage/key/StorageKeyFactory'
import { and, eq } from 'drizzle-orm'
import { NextRequest } from 'next/server'

const MAP_KIND_FIELD = /^map_(alpha|color|normal|ao|roots|tips|height|id)$/

/** Stores the project-wide texture atlas maps after authorizing project ownership. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
	const rateLimited = uploadRateLimiter.enforce(request, UploadRateLimitBucket.HairCardBakeUpload)
	if (rateLimited) {
		return rateLimited
	}

	const session = await auth()
	if (!session?.user?.id) {
		return Response.json(apiError('UNAUTHENTICATED'), { status: 401 })
	}

	const { projectId } = await params
	const [project] = await db
		.select()
		.from(projects)
		.where(and(eq(projects.id, projectId), eq(projects.userId, session.user.id)))
		.limit(1)
	if (!project) {
		return Response.json(apiError('NOT_FOUND'), { status: 404 })
	}

	const formData = await request.formData()
	const storage = container.resolve<StorageClient>(ServiceAlias.StorageClient)
	const storageKeyFactory = container.resolve<StorageKeyFactory>(ServiceAlias.StorageKeyFactory)
	const maps: BakedMapsRecord = {}

	// See HairCardLayoutHash/Editor.bakeHairCards - fingerprints the card layout this exact bake was
	// rendered from, so GroomHairCardLookup can later tell a stale bake apart from a fresh one.
	const sceneHashField = formData.get('sceneHash')
	if (typeof sceneHashField !== 'string' || sceneHashField.length === 0) {
		return Response.json(apiError('MISSING_REQUIRED_FIELDS', { field: 'sceneHash' }), { status: 400 })
	}

	// One bake call always applies one resolution across every map kind it renders
	// (HairCardBakeRequest.resolution), so this one field covers every map in `maps` below - see
	// BakedMapsRecord/HairCardBakeMapCheckboxCard's resolutionMismatch warning for why it's tracked
	// per persisted map at all.
	const resolutionField = formData.get('resolution')
	const resolution = typeof resolutionField === 'string' ? Number(resolutionField) : NaN
	if (typeof resolutionField !== 'string' || resolutionField.length === 0 || !Number.isFinite(resolution) || resolution <= 0) {
		return Response.json(apiError('MISSING_REQUIRED_FIELDS', { field: 'resolution' }), { status: 400 })
	}

	for (const [field, value] of formData.entries()) {
		const match = MAP_KIND_FIELD.exec(field)
		if (!match) {
			continue
		}
		const mapKind = match[1] as BakeMapKind

		if (!(value instanceof File)) {
			return Response.json(apiError('MISSING_FILE', { field }), { status: 400 })
		}
		if (value.type !== 'image/png') {
			return Response.json(apiError('INVALID_FILE_TYPE', { field }), { status: 400 })
		}
		if (value.size === 0) {
			return Response.json(apiError('MISSING_FILE', { field }), { status: 400 })
		}
		if (value.size > BAKE.MAX_UPLOAD_FILE_BYTES) {
			return Response.json(apiError('FILE_TOO_LARGE', { field }), { status: 413 })
		}

		const arrayBuffer = await value.arrayBuffer()
		const bytes = new Uint8Array(arrayBuffer)
		const hash = await sha256Hex(arrayBuffer)
		const key = storageKeyFactory.createHairCardBakeMapKey(projectId, mapKind, hash)
		await storage.uploadObject(key, bytes, 'image/png')
		maps[mapKind] = { url: key.getPublicUrl(), resolution }
	}

	// Merge into the row's existing bakedMaps rather than overwrite - a partial re-bake (e.g. only
	// "color" re-checked) must not drop previously-baked kinds like "alpha"/"normal" (each keeping
	// whatever resolution it was itself last baked at).
	const bakedMaps: BakedMapsRecord = { ...(project.bakedMaps as BakedMapsRecord), ...maps }
	await db
		.update(projects)
		.set({ bakedMaps, bakedMapsSceneHash: sceneHashField, updatedAt: new Date() })
		.where(eq(projects.id, projectId))

	return Response.json({ maps })
}

async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
	const digest = await crypto.subtle.digest('SHA-256', bytes)
	return Array.from(new Uint8Array(digest))
		.map((byte) => byte.toString(16).padStart(2, '0'))
		.join('')
}
