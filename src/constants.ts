export const IMAGE_CONFIG = {
	FULL_WIDTH: 1280,
	PREVIEW_WIDTH: 512,
	FULL_QUALITY: 0.85,
	SMALL_QUALITY: 0.45,
	MAX_FILE_BYTES: 10 * 1024 * 1024,
	ORIGINAL_SUBDIR: 'original',
	SMALL_SUBDIR: 'small',
} as const

export const EDITOR_VIEWPORT = {
	FRAME_DISTANCE_PADDING: 1.2,
	// Subdivisions of WorkingAreaGrid's inner lines across the working area (HAIR_CARD.WORKING_AREA_MIN/MAX,
	// a 1x1 square) - 10x10 cells, enough to align cards by eye.
	GRID_DIVISIONS: 10,
} as const

// See HairStrandCenterlineCurve for how these are used.
export const HAIR_STRAND = {
	RADIAL_SEGMENTS: 8, // sides around the strand's cross-section
	MIN_LENGTH_SEGMENTS: 2,
	// Length segments per world unit - a strand's segment count (see HairStrandGeometryGenerator)
	// scales with its own length instead of being fixed, so short (e.g. heavily cut) strands don't
	// carry the same subdivision as long ones.
	SEGMENT_DENSITY: 80,
	BASE_BEND_EXTENT: 0.35, // fraction of length over which the root bends back onto the -Z axis
	BASE_HEIGHT_FACTOR: 5, // root rise height in front of z = 0, as a multiple of thickness
} as const

// Hair card model/widget tuning - see HairCardWidget, HairCardMoveInteractionHandler,
// HairCardResizeInteractionHandler, and docs/editor/hair-cards-plan.md. Cards aren't rotatable,
// and are moved/resized by their own always-on gestures instead.
export const HAIR_CARD = {
	DEFAULT_WIDTH: 1,
	DEFAULT_DEPTH: 1,
	MIN_SIZE: 0.1,
	// A handle's world size = distance-to-camera * HANDLE_SCREEN_SIZE (see
	// HairCardWidget/CameraUpdateController), so it reads as the same on-screen size at any zoom.
	HANDLE_SCREEN_SIZE: 0.008,
	// Each handle's pick target (HairCardWidget's invisible collider mesh) is drawn bigger than the
	// handle actually looks, so it stays comfortable to grab even once the visible cube itself is
	// tiny on screen - a small visible affordance with a larger invisible hit area is the standard
	// fix for tiny draggable gizmos, not something to reproduce with the visible mesh alone.
	HANDLE_COLLIDER_SCALE: 2,
	// The card's collider mesh (EditorController.hairCardMaterial) - purely a pick target now, never
	// drawn (see EditorController.hairCardOutlineMaterial/Viewport's per-card outline for the visible
	// unselected-card rectangle instead).
	COLLIDER_OPACITY: 0,
	// The working area every card is laid out inside - see WorkingAreaGrid and
	// HairCardWorkingArea's clamp helpers, used by move and resize. The same bounds define the
	// project-wide bake's 0-1 texture atlas, so card placement directly determines atlas UVs.
	WORKING_AREA_MIN: 0,
	WORKING_AREA_MAX: 1,
	// Root spread: what fraction of the card's depth, measured in from its "top" edge, root
	// positions are sampled within - see HairCardStrandsGenerator. Coverage: a root density, not a
	// raw strand count - the actual strand count scales with width * rootSpread (see
	// HairCardStrandsGenerator's "Coverage as density"), so a card's visual density (how "covered"
	// it looks) holds steady as it's resized instead of drifting with it; not to be confused with
	// root spread, a separate knob for where within that strip roots may land. Height variance: how much
	// each strand's rise height (see HairStrandCenterlineCurve) is randomly jittered away from the
	// thickness-derived baseline, as a fraction of it - 0 keeps every strand at the same height, 1
	// allows it to swing anywhere from flat to double. Cut variance: how much each strand's length
	// is randomly shortened, as a fraction of its full (untrimmed) length - 0 leaves every strand at
	// its full length, 1 lets an individual strand be cut anywhere from full length down to nothing,
	// so a card reads like it was trimmed unevenly rather than cut to one exact length. All four are
	// per-card SceneObjectData fields (Project.ts), edited via HairCardOptionsPanel.
	DEFAULT_ROOT_SPREAD: 0.1,
	MIN_ROOT_SPREAD: 0.02,
	MAX_ROOT_SPREAD: 0.25,
	ROOT_SPREAD_STEP: 0.01,
	DEFAULT_COVERAGE: 400,
	MIN_COVERAGE: 1,
	MAX_COVERAGE: 1600,
	DEFAULT_HEIGHT_VARIANCE: 0,
	MIN_HEIGHT_VARIANCE: 0,
	MAX_HEIGHT_VARIANCE: 1,
	HEIGHT_VARIANCE_STEP: 0.01,
	DEFAULT_CUT_VARIANCE: 0,
	MIN_CUT_VARIANCE: 0,
	MAX_CUT_VARIANCE: 1,
	CUT_VARIANCE_STEP: 0.01,
	// How long a settings/move/resize edit waits, after the last change, before its strand meshes
	// are rebuilt - see HairCardStrandsController.scheduleRegenerate. Meshes are removed outright
	// (not just left stale) the instant such an edit starts - see
	// HairCardMoveInteractionHandler/HairCardResizeInteractionHandler - so nothing has to be
	// recomputed on every drag step, only once it settles.
	STRANDS_REGENERATE_DEBOUNCE_MS: 250,
	// Template HairStrandParams every generated card strand starts from - see
	// HairCardStrandsGenerator. Not per-card (only rootSpread/coverage/heightVariance/cutVariance
	// are) - thickness is a global, editor-wide setting instead (see Project.thickness,
	// HairCardsPanel's Global section), shared by every card.
	STRAND: {
		MIN_LENGTH: 0.02, // floor a strand's length is clamped to even when a card leaves it almost no room - see HairCardStrandsGenerator.
		BOTTOM_PADDING: 0.01, // gap kept between a strand's tip and the card's bottom (-Z) edge - see HairCardStrandsGenerator.
		DEFAULT_THICKNESS: 0.003,
		MIN_THICKNESS: 0.0005,
		MAX_THICKNESS: 0.01,
		THICKNESS_STEP: 0.0005,
		BASE_TAPER: 0.15,
		TIP_TAPER: 0.05,
		BASE_BEND_ANGLE: Math.PI / 3,
		COLOR: 0x9c836b,
	},
	// Per-card modifier stack tuning - see src/lib/hair/modifiers. Each sub-group holds only the
	// sliders HairCardModifierParamsFields actually exposes, plus that modifier's own internal
	// tuning constants (never user-facing).
	MODIFIERS: {
		TWIST: {
			DEFAULT_AMOUNT: 0,
			MIN_AMOUNT: 0,
			MAX_AMOUNT: 1,
			AMOUNT_STEP: 0.01,
			MAX_TURNS: 3, // amount = 1 twists a strand a full 3 turns over its own length
		},
		NOISE: {
			DEFAULT_AMOUNT: 0,
			MIN_AMOUNT: 0,
			MAX_AMOUNT: 1,
			AMOUNT_STEP: 0.01,
			DEFAULT_SCALE: 0.5,
			MIN_SCALE: 0.05,
			MAX_SCALE: 1,
			SCALE_STEP: 0.01,
			MAX_AMPLITUDE: 0.05, // amount = 1 jitters a point up to this far, in world units
			MIN_FREQUENCY: 2, // scale = 0 wobbles this many times over a strand's length
			MAX_FREQUENCY: 10, // scale = 1 wobbles this many times over a strand's length
		},
		CLUMP: {
			DEFAULT_REGION_COUNT: 6,
			MIN_REGION_COUNT: 1,
			MAX_REGION_COUNT: 30,
			DEFAULT_STRENGTH: 0.5,
			MIN_STRENGTH: 0,
			MAX_STRENGTH: 1,
			STRENGTH_STEP: 0.01,
			DEFAULT_STRAY_FRACTION: 0.15,
			MIN_STRAY_FRACTION: 0,
			MAX_STRAY_FRACTION: 0.9,
			STRAY_FRACTION_STEP: 0.01,
			KMEANS_ITERATIONS: 4, // fixed-iteration Lloyd's algorithm - "good enough" grouping, not exact convergence
			SHAPE_SAMPLE_COUNT: 12, // t-samples used to average a region's member shapes
		},
		BRAID: {
			DEFAULT_GROUP_SIZE: 3,
			MIN_GROUP_SIZE: 2,
			MAX_GROUP_SIZE: 6,
			DEFAULT_STRENGTH: 0.6,
			MIN_STRENGTH: 0,
			MAX_STRENGTH: 1,
			STRENGTH_STEP: 0.01,
			DEFAULT_PERIOD: 3,
			MIN_PERIOD: 1,
			MAX_PERIOD: 8,
			PERIOD_STEP: 1, // crossings along a strand's full length
		},
	},
} as const

// Hair card texture baking - see src/lib/hair/bake and docs/editor/hair-cards-plan.md's "Baking"
// section. Renders every card's current strand geometry with one orthographic camera into a set of
// textures (alpha/color/normal/ao/roots/tips/height/id) covering the shared 0-1 working area.
export const BAKE = {
	RESOLUTIONS: [512, 1024, 2048, 4096],
	DEFAULT_RESOLUTION: 1024,
	// Dilation grows every map's valid (alpha > 0) region outward by this many passes, filling
	// background texels with the nearest valid value - erases seams at bilinear/mip-map edges.
	// Applied to every requested map except alpha itself (alpha is the mask driving the others).
	DILATION_PASSES: 8,
	// MSAA sample count for the bake's byte render target (HairCardBakeGpuRenderer.getByteTarget) -
	// WebGLRenderer's own `antialias: true` only covers the default canvas framebuffer, not
	// render-to-texture, so every baked map needs this to avoid aliasing on strand silhouettes that
	// are often only a few texels wide. Deliberately not applied to the float G-buffer target (AO
	// raytracing's position/normal buffers) - averaging those at silhouette edges would blend two
	// unrelated surface points into a value that matches no real geometry.
	MSAA_SAMPLES: 4,
	// Bake camera near/far are fit to the combined geometry's bounding-box Z range each bake (see
	// HairCardBakeOrthographicCamera), not a fixed world size - these are just the small margins
	// kept beyond that range so strand geometry right at z = 0 or at its peak rise isn't clipped.
	CAMERA_NEAR_PADDING: 0.01,
	CAMERA_FAR_PADDING: 0.05,
	AO: {
		// Which HairCardBakeAoAlgorithm implementation HairCardBaker uses - a dev-only switch for
		// comparing the two (see HairCardBakeAoAlgorithmFactory), not user-facing, same as the rest
		// of this block.
		ALGORITHM: 'shadowSweep' as 'raytrace' | 'shadowSweep',

		RAYTRACE: {
			// Cosine-weighted hemisphere rays cast per texel against the combined atlas strand
			// geometry (see HairCardBakeRaytracedAoPass) - no user-facing control, this is the one
			// map without a per-map option, so its cost/quality tradeoff is fixed here instead.
			SAMPLE_COUNT: 32,
			MAX_DISTANCE: 0.15, // world units a secondary ray can travel before counting as unoccluded
			BIAS: 0.0005, // ray-origin offset along the surface normal, avoids self-intersection
			// Per-texel cost varies a lot (skipped outside the alpha mask vs. SAMPLE_COUNT raycasts
			// against the BVH), so yielding is time-budgeted rather than tied to a fixed texel count -
			// once this many milliseconds of work have passed, yield one frame to the browser so a
			// cancel click and the progress label stay responsive.
			YIELD_BUDGET_MS: 50,
		},

		// HairCardBakeShadowSweepAoPass: renders the atlas with one shadow-casting directional light
		// swept to many positions above it, averaging the shadow-only result of every render into
		// the AO value - a rasterized alternative to RAYTRACE's per-texel raycasts.
		SHADOW_SWEEP: {
			AZIMUTH_STEPS: 16, // light positions sampled across AZIMUTH_SWEEP_DEGREES, per elevation step
			AZIMUTH_SWEEP_DEGREES: 180,
			ELEVATION_STEPS: 3, // repeats of the azimuth sweep, each at a different ELEVATION_BASELINE_DEGREES offset
			ELEVATION_BASELINE_DEGREES: 90, // straight overhead - matches the bake camera's own -Z look direction
			ELEVATION_OFFSET_DEGREES: 10, // each step nudges +/- this far off the baseline - just enough tilt for Y-axis shadow variance, not a hemisphere sweep
			LIGHT_DISTANCE_PADDING: 0.05, // world units the light orbits beyond the atlas geometry's bounding radius, mirrors CAMERA_FAR_PADDING
			// Shadow map size is the bake's own resolution (see HairCardBakeShadowSweepAoPass.compute) -
			// not a fixed constant, so AO quality tracks whatever resolution the user picked instead of
			// staying pinned to one size regardless of a 512 vs 4096 bake.
			SHADOW_BIAS: -0.0005, // shadow-coord depth bias, avoids self-shadowing acne on thin strand geometry
			SHADOW_NORMAL_BIAS: 0.002, // world-space offset along the surface normal before the shadow lookup, same purpose as RAYTRACE.BIAS
			// Every sweep sample is a full render; yielding to the browser (a requestAnimationFrame wait)
			// every Nth sample keeps a cancel click and the progress label responsive without paying the
			// ~16ms yield cost on every single one of the ~33 samples.
			YIELD_EVERY_N_SAMPLES: 4,
		},
	},
	ROOTS: { DEFAULT_SCALE: 0.3, MIN_SCALE: 0.05, MAX_SCALE: 1, SCALE_STEP: 0.01 },
	TIPS: { DEFAULT_SCALE: 0.3, MIN_SCALE: 0.05, MAX_SCALE: 1, SCALE_STEP: 0.01 },
	ID: { DEFAULT_GROUP_COUNT: 8, MIN_GROUP_COUNT: 2, MAX_GROUP_COUNT: 64 },
	MAX_UPLOAD_FILE_BYTES: 20 * 1024 * 1024,
	// HairCardBakePreviewRenderer's standalone scene - a single 1x1 plane matching the atlas's own
	// 0-1 UV space, shown with the bake's color/normal/ao/alpha maps applied as a MeshStandardMaterial.
	PREVIEW: {
		CAMERA_DISTANCE: 1.6,
		ROUGHNESS: 0.85,
		METALNESS: 0,
	},
	// Default project.previewColors (HairCardBakeDialog's 4 color pickers) - see
	// HairCardPreviewMapComposer for how they're blended with the alpha/id/roots/tips bakes into the
	// groom editor's "Preview" view mode texture. Hex strings, not three.js Color numbers, since
	// they're bound directly to <input type="color"> and stored on the project as-is.
	PREVIEW_COLORS: {
		DEFAULT_PRIMARY: '#9c836b',
		DEFAULT_SECONDARY: '#5b4433',
		DEFAULT_TIP: '#d8c3a5',
		DEFAULT_ROOT: '#2b1d14',
	},
} as const

// Groom editor's spline tool tuning - see GroomProject, SplineVertexWidget,
// SplineVertexDragInteractionHandler, GroomViewport. Splines are a wholly separate system from
// hair cards (own tool set, own commands, own persisted `groom` column) - not nested under
// HAIR_CARD.
export const GROOM = {
	// GroomViewport.frameAll's virtual ground bound - not a rendered surface, just a reference size
	// so a fresh/empty viewport still frames to something meaningful.
	GROUND_PLANE_SIZE: 10,
	// The head/scalp proxy splines are placed against - see GroomScalp.ts. Sits on the ground plane
	// (center at y = RADIUS), sized against GROUND_PLANE_SIZE/SPLINE.DEFAULT_LENGTH.
	SCALP: {
		RADIUS: 1,
		WIDTH_SEGMENTS: 32,
		HEIGHT_SEGMENTS: 16,
	},
	// GroomToolbar's view-mode dropdown default - see GroomReactBridgeState.viewMode/the
	// `projects.groomViewMode` column.
	DEFAULT_VIEW_MODE: 'shaded',
	SPLINE: {
		// PlaceSplineTool places vertex A at the click point and vertex B at a fixed offset from it
		// - mirrors ProjectScene.addHairCard's fixed default rectangle - see GroomScene.addSpline.
		DEFAULT_LENGTH: 1,
		DEFAULT_DIRECTION: { x: 0, y: 0, z: 1 } as const,
		// How far GroomEditor.addVertexToSelectedSpline extrapolates a new vertex past the spline's
		// current last vertex, along the (last - second-to-last) direction - see GroomScene.addVertexToSpline.
		// Also how far AddPointAnchor's screen anchor (the "add point" overlay button) sits past the
		// last vertex, so the button doesn't crowd/overlap it.
		NEW_VERTEX_OFFSET: 0.6,
		// Per-vertex orientation - store-only this iteration (no interactive editing yet), defaults
		// to world up for every new vertex.
		DEFAULT_VERTEX_DIRECTION: { x: 0, y: 1, z: 0 } as const,
		// Curve subdivisions per world unit (SplineOptionsPanel's "Resolution" field). Higher values
		// produce finer geometry; the final subdivision count is still clamped below.
		DEFAULT_RESOLUTION: 10,
		MIN_RESOLUTION: 1,
		MAX_RESOLUTION: 64,
		RESOLUTION_STEP: 1,
		MIN_SUBDIVISIONS: 1,
		MAX_SUBDIVISIONS: 64,
		// Diameter of the invisible collider tube extruded along a spline's curve - see
		// SplineCurveGeometryGenerator.
		BODY_WIDTH: 0.2,
		// A spline can never be deleted-point'd below this many vertices - see
		// GroomEditor.deleteActiveSplineVertex.
		MIN_VERTEX_COUNT: 2,
		// The card strip - a flat, textured ribbon of quads instancing the referenced hair card along
		// the curve (SplineCardStripGeometryGenerator) - separate from the always-present invisible
		// collider tube above.
		CARD_STRIP: {
			// The card strip's own width - a spline-owned field (SplineObject.cardWidth), independent of
			// whichever hair card `hairCardId` references. Picking a hair card only ever changes the
			// strip's UVs/texture (SplineCardStripGeometryGenerator's uv loop) and GroomHairCardLookup's
			// baked-texture maps; it must never resize the mesh. This is this field's default for a
			// freshly placed spline - same order of magnitude as SPLINE.BODY_WIDTH's collider diameter.
			DEFAULT_WIDTH: 0.3,
			MIN_WIDTH: 0.02,
			MAX_WIDTH: 2,
			WIDTH_STEP: 0.02,
			// SplineOptionsPanel's "Card start offset" field - arc-length world units from the curve's
			// own start where the card strip begins; it always ends exactly at the curve's end.
			DEFAULT_START_OFFSET: 0,
			START_OFFSET_STEP: 0.02,
			// Below this much remaining curve length past a (clamped) start offset, the card strip is
			// hidden entirely rather than drawing a degenerate sliver.
			MIN_REMAINING_LENGTH: 0.02,
			// Opacity of an unselected spline's card strip while another spline is selected - see
			// GroomViewport.render's ghosting rule.
			GHOST_OPACITY: 0.15,
		},
		// SplineSmoothModifyPanel's "Soft selection" switch + "Influence"
		// slider - see SplineSmoothModifyFalloff.
		SMOOTH_MODIFY: {
			DEFAULT_ENABLED: false,
			DEFAULT_INFLUENCE: 0.5,
			MIN_INFLUENCE: 0,
			MAX_INFLUENCE: 1,
			// Arc-length world units past which a dragged vertex's transform falloff reaches zero.
			// The full groom workspace width gives maximum influence enough reach for authored splines
			// whose control points are commonly several units apart.
			FALLOFF_RADIUS: 10,
		},
		// Screen-space diameters for SplineVertexWidget's visible position handle and its larger,
		// invisible pick target. World diameters are these values times distance-to-camera.
		POSITION_HANDLE_SCREEN_DIAMETER: 0.01,
		POSITION_HANDLE_COLLIDER_SCREEN_DIAMETER: 0.06,
		// Per-vertex scale, edited via the scale handle (SplineVertexGizmo).
		DEFAULT_VERTEX_SCALE: 1,
		MIN_VERTEX_SCALE: 0.1,
		MAX_VERTEX_SCALE: 50,
		// Screen-space dimensions for the active vertex's rotate/scale gizmo. World dimensions are
		// these values times distance-to-camera. Both knobs deliberately use the same diameter.
		// ROTATE_RING_SCREEN_RADIUS/SCALE_LINE_SCREEN_LENGTH are sized so neither knob's collider
		// (radius GIZMO_KNOB_COLLIDER_SCREEN_DIAMETER/2) overlaps the position handle's collider
		// (radius POSITION_HANDLE_COLLIDER_SCREEN_DIAMETER/2) at the shared vertex origin - previously
		// the ring sat AT the position collider's own radius, so the rotate knob's collider mostly
		// overlapped it and picking between the two was a coin flip (nearest-along-ray wins, see
		// HitTester). Both now clear it by a ~0.015 screen-space gap; SCALE_LINE_SCREEN_LENGTH keeps
		// its original ~1.7x-of-ring-radius ratio so the scale knob still sits visibly past the ring.
		ROTATE_RING_SCREEN_RADIUS: 0.07,
		GIZMO_LINE_SCREEN_RADIUS: 0.001,
		SCALE_LINE_SCREEN_LENGTH: 0.12,
		GIZMO_KNOB_SCREEN_DIAMETER: 0.01,
		GIZMO_KNOB_COLLIDER_SCREEN_DIAMETER: 0.05,
		// White hover highlight shared by every vertex gizmo handle (move/rotate/scale) - not
		// theme-dependent, same as e.g. a native OS cursor highlight.
		HANDLE_HOVER_COLOR: 0xffffff,
		// SplineCurveInsertHint is rendered offset from its own anchor's screen position (the hover
		// point) by this many CSS pixels (up and to the right - see its component's style) rather than
		// centered exactly on it, so the hint's "+" glyph never sits directly under the OS pointer icon,
		// which would otherwise cover it.
		CURSOR_OVERLAY_OFFSET_PX: 18,
	},
} as const

export const RESPONSIVE = {
	MOBILE_BREAKPOINT: 768,
} as const

export const NOTIFICATIONS = {
	POLL_INTERVAL_MS: 30_000,
} as const

export type EditorTheme = 'light' | 'dark'

export const EDITOR_SCENE_COLORS: Record<
	EditorTheme,
	{
		object: number
		viewportBackground: number
		/** Muted inner subdivision lines of WorkingAreaGrid. */
		grid: number
		hairCardWidget: number
		/** Muted rectangle-frame outline drawn on every unselected hair card - see Viewport's per-card outline. */
		hairCardOutline: number
		workingArea: number
		/** The card strip's wireframe overlay (GroomEditorController.cardStripWireframeMaterial) - the curve line itself now matches splineVertexWidget's color instead. */
		splineBody: number
		/** SplineVertexWidget's selected-state vertex handles - same role as hairCardWidget. */
		splineVertexWidget: number
		/** SplineVertexGizmo's rotate ring + scale handle for the active vertex - see GroomReactBridgeState.activeVertexIndex. */
		splineVertexGizmo: number
		/** GroomViewport's head/scalp proxy sphere - see GROOM.SCALP. */
		scalp: number
		/** An unselected spline's card strip while another spline is selected - see GROOM.SPLINE.CARD_STRIP.GHOST_OPACITY. */
		cardStripGhost: number
	}
> = {
	dark: {
		object: 0xffffff,
		viewportBackground: 0x18181b,
		grid: 0x27272a,
		hairCardWidget: 0x22d3ee,
		hairCardOutline: 0x52525b,
		workingArea: 0xffffff,
		splineBody: 0x52525b,
		splineVertexWidget: 0x22d3ee,
		splineVertexGizmo: 0xf97316,
		scalp: 0x71717a,
		cardStripGhost: 0x3f3f46,
	},
	light: {
		object: 0x475569,
		viewportBackground: 0xf8fafc,
		grid: 0x94a3b8,
		hairCardWidget: 0x0891b2,
		hairCardOutline: 0x94a3b8,
		workingArea: 0x1e293b,
		splineBody: 0x94a3b8,
		splineVertexWidget: 0x0891b2,
		splineVertexGizmo: 0xc2410c,
		scalp: 0xcbd5e1,
		cardStripGhost: 0xcbd5e1,
	},
}
