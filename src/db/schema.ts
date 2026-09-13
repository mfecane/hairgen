// Single source of truth for database schema
// Used by both frontend and seed (copied to seed on container creation)

import { sql } from 'drizzle-orm'
import { pgTable, text, timestamp, index, unique, check, bigint, jsonb, doublePrecision } from 'drizzle-orm/pg-core'
import { BAKE, GROOM, HAIR_CARD } from '@/constants'
import type { BakedMapsRecord, HairCardBakeRequest } from '@/lib/hair/bake/HairCardBakeTypes'
import type { HairPreviewColors } from '@/lib/hair/compose/HairCardPreviewMapTypes'
import type { GroomViewMode } from '@/editor/groom/main/GroomReactBridge'

// Auth.js required tables plus merged application-facing user fields.
// `users` is now the single table for identity + public profile data.
export const users = pgTable(
	'user',
	{
		id: text('id').primaryKey(),
		email: text('email').notNull(),
		emailVerified: timestamp('emailVerified', { mode: 'date' }),

		// Auth.js compatibility fields
		name: text('name'),
		image: text('image'),

		// Application profile fields
		avatar: text('avatar'),
		createdAt: timestamp('createdAt', { mode: 'date' }).defaultNow(),
		updatedAt: timestamp('updatedAt', { mode: 'date' }).defaultNow(),
		/** Set when the user cancels their account (soft delete). */
		deletedAt: timestamp('deletedAt', { mode: 'date' }),
	},
	(table) => ({
		emailUnique: unique('user_email_unique').on(table.email),
		emailIdx: index('user_email_idx').on(table.email),
		deletedAtIdx: index('user_deletedAt_idx').on(table.deletedAt),
		emailLengthCheck: check('user_email_length_check', sql`char_length(${table.email}) <= 320`),
		nameLengthCheck: check(
			'user_name_length_check',
			sql`${table.name} is null or char_length(${table.name}) <= 120`
		),
	})
)

export const accounts = pgTable(
	'account',
	{
		userId: text('userId')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		type: text('type').notNull(), // 'oauth' | 'email'
		provider: text('provider').notNull(),
		providerAccountId: text('providerAccountId').notNull(),
		refresh_token: text('refresh_token'),
		access_token: text('access_token'),
		expires_at: bigint('expires_at', { mode: 'number' }),
		token_type: text('token_type'),
		scope: text('scope'),
		id_token: text('id_token'),
		session_state: text('session_state'),
	},
	(table) => ({
		userIdIdx: index('account_userId_idx').on(table.userId),
		providerIdx: unique('account_provider_unique').on(table.provider, table.providerAccountId),
	})
)

export const sessions = pgTable(
	'session',
	{
		sessionToken: text('sessionToken').primaryKey(),
		userId: text('userId')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		expires: timestamp('expires', { mode: 'date' }).notNull(),
	},
	(table) => ({
		userIdIdx: index('session_userId_idx').on(table.userId),
	})
)

export const verificationTokens = pgTable(
	'verificationToken',
	{
		identifier: text('identifier').notNull(),
		token: text('token').notNull(),
		expires: timestamp('expires', { mode: 'date' }).notNull(),
	},
	(table) => ({
		identifierTokenIdx: unique('verificationToken_identifier_token_unique').on(table.identifier, table.token),
	})
)

export const projects = pgTable(
	'project',
	{
		id: text('id').primaryKey(),
		userId: text('userId')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		name: text('name').notNull().default('Untitled'),
		// Persisted `ProjectScene.toJSON()` output - an array of `SceneObjectData`.
		scene: jsonb('scene').$type<unknown[]>().notNull().default([]),
		// Global strand thickness (see Project.thickness) - a workspace preference, not scene data,
		// but still persisted per-project rather than resetting every session.
		thickness: doublePrecision('thickness').notNull().default(HAIR_CARD.STRAND.DEFAULT_THICKNESS),
		// Persisted `GroomScene.toJSON()` output - an array of `SplineObjectData`. Own column, own
		// model, deliberately not sharing `scene`'s SceneObjectData shape - see the groom editor.
		groom: jsonb('groom').$type<unknown[]>().notNull().default([]),
		// The project's latest baked hair-card texture atlas maps (see HairCardBaker/the
		// hair-cards/bake route) - written only by that route, never client-settable via PUT/POST.
		// Lets the groom editor's "textured" view mode keep working after a reload instead of only
		// within the session that produced the bake.
		bakedMaps: jsonb('bakedMaps').$type<BakedMapsRecord>().notNull().default({}),
		// HairCardLayoutHash fingerprint of the hair-card layout that produced `bakedMaps`' current
		// contents - written only by the hair-cards/bake route, alongside bakedMaps, never
		// client-settable via PUT/POST. Null for a bake predating this feature. Lets
		// GroomHairCardLookup.getBakeStatus tell "stale" (cards moved/resized since) apart from
		// "fresh", the same way bakedMaps itself lets "textured" mode survive a reload.
		bakedMapsSceneHash: text('bakedMapsSceneHash'),
		// HairCardBakeDialog's 4 color pickers (see HairCardPreviewMapComposer/Project.previewColors)
		// - a workspace preference like `thickness`, client-settable via PUT/POST like it.
		previewColors: jsonb('previewColors').$type<HairPreviewColors>().notNull().default({
			primary: BAKE.PREVIEW_COLORS.DEFAULT_PRIMARY,
			secondary: BAKE.PREVIEW_COLORS.DEFAULT_SECONDARY,
			tip: BAKE.PREVIEW_COLORS.DEFAULT_TIP,
			root: BAKE.PREVIEW_COLORS.DEFAULT_ROOT,
		}),
		// HairCardBakeDialog's resolution select, per-map checkboxes, and per-map option sliders
		// (roots/tips scale, id group count) - a workspace preference like `previewColors`, so the
		// dialog reopens with the same selection instead of resetting to defaults every session.
		// Client-settable via PUT/POST like `previewColors`; never touched by the bake route itself
		// (that route only ever writes `bakedMaps`/`bakedMapsSceneHash`).
		bakeOptions: jsonb('bakeOptions').$type<HairCardBakeRequest>().notNull().default({
			resolution: BAKE.DEFAULT_RESOLUTION,
			alpha: true,
			color: true,
			normal: true,
			ao: false,
			height: false,
			roots: { enabled: false, scale: BAKE.ROOTS.DEFAULT_SCALE },
			tips: { enabled: false, scale: BAKE.TIPS.DEFAULT_SCALE },
			id: { enabled: false, groupCount: BAKE.ID.DEFAULT_GROUP_COUNT },
		}),
		// GroomToolbar's view-mode dropdown (see GroomReactBridgeState.viewMode) - a workspace
		// preference like `previewColors`/`bakeOptions`, persisted on the same row the groom editor's
		// own `groom` column lives on. Client-settable via PUT/POST.
		groomViewMode: text('groomViewMode')
			.$type<GroomViewMode>()
			.notNull()
			.default(GROOM.DEFAULT_VIEW_MODE),
		createdAt: timestamp('createdAt', { mode: 'date' }).defaultNow(),
		updatedAt: timestamp('updatedAt', { mode: 'date' }).defaultNow(),
	},
	(table) => ({
		userIdIdx: index('project_userId_idx').on(table.userId),
		nameLengthCheck: check('project_name_length_check', sql`char_length(${table.name}) <= 120`),
	})
)

export const emailLoginNonces = pgTable(
	'emailLoginNonce',
	{
		id: text('id').primaryKey(),
		email: text('email').notNull(),
		nonceHash: text('nonceHash').notNull(),
		expiresAt: timestamp('expiresAt', { mode: 'date' }).notNull(),
		consumedAt: timestamp('consumedAt', { mode: 'date' }),
		createdAt: timestamp('createdAt', { mode: 'date' }).defaultNow(),
	},
	(table) => ({
		emailIdx: index('emailLoginNonce_email_idx').on(table.email),
		nonceHashIdx: unique('emailLoginNonce_nonceHash_unique').on(table.nonceHash),
		expiresAtIdx: index('emailLoginNonce_expiresAt_idx').on(table.expiresAt),
	})
)
