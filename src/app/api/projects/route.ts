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
import { desc, eq } from 'drizzle-orm'
import { nanoid } from 'nanoid'

/**
 * GET /api/projects
 * List the authenticated user's projects, most recently updated first.
 */
export async function GET() {
	const session = await auth()
	if (!session?.user?.id) {
		return Response.json(apiError('UNAUTHENTICATED'), { status: 401 })
	}

	const rows = await db
		.select({ id: projects.id, name: projects.name, updatedAt: projects.updatedAt, createdAt: projects.createdAt })
		.from(projects)
		.where(eq(projects.userId, session.user.id))
		.orderBy(desc(projects.updatedAt))

	return Response.json({ projects: rows })
}

/**
 * POST /api/projects
 * Create a new project owned by the authenticated user, optionally seeded with a serialized scene,
 * global thickness (see `Project.thickness`), preview map colors (see `Project.previewColors`),
 * bake dialog options (see `HairCardBakeRequest`), groom scene (see `GroomScene.toJSON`), and/or
 * groom view mode (see `GroomReactBridgeState.viewMode`).
 */
export async function POST(request: NextRequest) {
	const session = await auth()
	if (!session?.user?.id) {
		return Response.json(apiError('UNAUTHENTICATED'), { status: 401 })
	}
	const body: {
		name?: unknown
		scene?: unknown
		thickness?: unknown
		groom?: unknown
		previewColors?: unknown
		bakeOptions?: unknown
		groomViewMode?: unknown
	} = request.headers.get('content-type')?.includes('application/json') ? await request.json() : {}
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
		.insert(projects)
		.values({
			id: nanoid(21),
			userId: session.user.id,
			...(body.name !== undefined ? { name: body.name } : {}),
			...(body.scene !== undefined ? { scene: body.scene } : {}),
			...(body.thickness !== undefined ? { thickness: body.thickness } : {}),
			...(body.groom !== undefined ? { groom: body.groom } : {}),
			...(body.previewColors !== undefined ? { previewColors: body.previewColors } : {}),
			...(body.bakeOptions !== undefined ? { bakeOptions: body.bakeOptions } : {}),
			...(body.groomViewMode !== undefined ? { groomViewMode: body.groomViewMode } : {}),
		})
		.returning({
			id: projects.id,
			name: projects.name,
			updatedAt: projects.updatedAt,
			createdAt: projects.createdAt,
		})

	return Response.json({ project })
}
