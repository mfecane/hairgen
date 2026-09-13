/**
 * The 4 user-picked colors HairCardBakeDialog's color pickers edit and HairCardPreviewMapComposer
 * blends together - see docs/editor/hair-cards-plan.md's "Preview map composer" section. Persisted
 * on the project (`Project.previewColors`, `projects.previewColors` column) rather than kept as
 * dialog-local form state, since the groom editor - a separate session reading the SAME project row
 * (see GroomHairCardLookup) - needs the same values to reproduce the composition. Hex strings (e.g.
 * "#9c836b"), not three.js Color numbers, since they're bound directly to native
 * `<input type="color">` elements and round-trip through JSON/jsonb as-is.
 */
export interface HairPreviewColors {
	/** Base color for strands the id map didn't lean toward `secondary` - see HairCardPreviewMapComposer. */
	primary: string
	/** The id map's other blend target - HairCardIdGroupAssigner's per-strand-group grayscale value smoothly interpolates between `primary` and this. */
	secondary: string
	/** Blended in near strand tips, weighted by the tips bake's own grayscale falloff. */
	tip: string
	/** Blended in near strand roots, weighted by the roots bake's own grayscale falloff. */
	root: string
}

/**
 * GroomHairCardLookup.getBakeStatus()'s result - drives GroomStatusBar's warning banner.
 * - 'missing': the object-editor project's `alpha` and/or `color` map hasn't been baked at all, so
 *   neither "Textured" nor "Preview" view mode has anything to show.
 * - 'stale': baked, but the hair-card layout (position/width/depth) has changed since that bake -
 *   see HairCardLayoutHash. The maps shown no longer match the cards' current placement.
 * - 'fresh': baked maps match the current layout (or a baked-before-this-feature-existed project,
 *   whose row has no recorded layout hash to compare against - see GroomHairCardLookup).
 */
export type HairCardBakeStatus = 'missing' | 'stale' | 'fresh'
