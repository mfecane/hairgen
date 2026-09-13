export const runtime = 'nodejs'

import '@/lib/serverBootstrap'

import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth/auth-server'
import { db } from '@/db'
import { projects } from '@/db/schema'
import { apiError } from '@/lib/api/errors'
import { isValidPreviewColors } from '@/lib/hair/compose/isValidPreviewColors'
import { isValidBakeOptions } from '@/lib/hair/bake/isValidBakeOptions'
import { isValidGroomViewMode } from '@/editor/groom/main/GroomReactBridge'
import { and, eq } from 'drizzle-orm'

/**
 * GET /api/projects/[projectId]
 * Load one project owned by the authenticated user, scene included.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
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

	return Response.json({ project })
}

/**
 * PUT /api/projects/[projectId]
 * Persist the project's name, scene (see `ProjectScene.toJSON`), global thickness (see
 * `Project.thickness`), preview map colors (see `Project.previewColors`), bake dialog options (see
 * `HairCardBakeRequest`), groom scene (see `GroomScene.toJSON`), and/or groom view mode (see
 * `GroomReactBridgeState.viewMode`). Each field is optional and independently applied, so the
 * object editor and groom editor can save on their own schedules without clobbering each other's
 * fields.
 */
export async function PUT(request: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
	const session = await auth()
	if (!session?.user?.id) {
		return Response.json(apiError('UNAUTHENTICATED'), { status: 401 })
	}

	const { projectId } = await params
	const body: {
		name?: unknown
		scene?: unknown
		thickness?: unknown
		groom?: unknown
		previewColors?: unknown
		bakeOptions?: unknown
		groomViewMode?: unknown
	} = await request.json()
	if (body.name !== undefined && typeof body.name !== 'string') {
		return Response.json(apiError('INVALID_NAME'), { status: 400 })
	}
	if (body.scene !== undefined && !Array.isArray(body.scene)) {
		return Response.json(apiError('MISSING_REQUIRED_FIELDS', { field: 'scene' }), { status: 400 })
	}
	if (body.thickness !== undefined && typeof body.thickness !== 'number') {
		return Response.json(apiError('MISSING_REQUIRED_FIELDS', { field: 'thickness' }), { status: 400 })
	}
	if (body.groom !== undefined && !Array.isArray(body.groom)) {
		return Response.json(apiError('MISSING_REQUIRED_FIELDS', { field: 'groom' }), { status: 400 })
	}
	if (body.previewColors !== undefined && !isValidPreviewColors(body.previewColors)) {
		return Response.json(apiError('MISSING_REQUIRED_FIELDS', { field: 'previewColors' }), { status: 400 })
	}
	if (body.bakeOptions !== undefined && !isValidBakeOptions(body.bakeOptions)) {
		return Response.json(apiError('MISSING_REQUIRED_FIELDS', { field: 'bakeOptions' }), { status: 400 })
	}
	if (body.groomViewMode !== undefined && !isValidGroomViewMode(body.groomViewMode)) {
		return Response.json(apiError('MISSING_REQUIRED_FIELDS', { field: 'groomViewMode' }), { status: 400 })
	}

	const [project] = await db
		.update(projects)
		.set({
			...(body.name !== undefined ? { name: body.name as string } : {}),
			...(body.scene !== undefined ? { scene: body.scene as unknown[] } : {}),
			...(body.thickness !== undefined ? { thickness: body.thickness as number } : {}),
			...(body.groom !== undefined ? { groom: body.groom as unknown[] } : {}),
			...(body.previewColors !== undefined ? { previewColors: body.previewColors } : {}),
			...(body.bakeOptions !== undefined ? { bakeOptions: body.bakeOptions } : {}),
			...(body.groomViewMode !== undefined ? { groomViewMode: body.groomViewMode } : {}),
			updatedAt: new Date(),
		})
		.where(and(eq(projects.id, projectId), eq(projects.userId, session.user.id)))
		.returning()

	if (!project) {
		return Response.json(apiError('NOT_FOUND'), { status: 404 })
	}

	return Response.json({ project })
}

/**
 * DELETE /api/projects/[projectId]
 * Permanently remove a project owned by the authenticated user.
 */
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
	const session = await auth()
	if (!session?.user?.id) {
		return Response.json(apiError('UNAUTHENTICATED'), { status: 401 })
	}

	const { projectId } = await params
	const deleted = await db
		.delete(projects)
		.where(and(eq(projects.id, projectId), eq(projects.userId, session.user.id)))
		.returning({ id: projects.id })

	if (deleted.length === 0) {
		return Response.json(apiError('NOT_FOUND'), { status: 404 })
	}

	return Response.json({ success: true })
}
