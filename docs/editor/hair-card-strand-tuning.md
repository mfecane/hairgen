# Hair card strand tuning

Builds on `hair-cards-plan.md`'s strand-generation section, which is now implemented
(`HairCardStrandsGenerator`, wired through `HairCardStrandsController`/`Editor`). This doc covers
tuning knobs added on top of that baseline that aren't obvious from the plan doc alone.

## Working plane: z = 0, vertical

Cards, their gizmo, the working area, and the grid all live in the z = 0 plane (X horizontal,
Y vertical) rather than the original y = 0 ground plane (X/Z horizontal). Width still runs along X;
what used to be "depth" (Z, growth toward -Z) is now Y, growth toward -Y (down the card, like real
hair under gravity); what used to be "height"/rise (Y, up off the ground) is now Z (out of the
card's face, toward the viewer). This is a coordinate swizzle throughout the math, not a rotation
applied on top of it - `HairStrandCenterlineCurve` generates points directly in the new axes,
`HairCardStrandsGenerator` translates roots by `(rootX, rootY, 0)`, and
`EditorController.hairCardGeometry` is a plain unrotated `PlaneGeometry` (its default orientation -
normal +Z - already matches, where before it needed an explicit `rotateX(-PI/2)` bake to lie flat).
`HairCardHandle.signZ`/axis `'z'` became `signY`/`'y'` to match. `InteractionContext`'s raycast
plane was renamed `GROUND_PLANE`/`intersectGroundPlane` -> `CARD_PLANE`/`intersectCardPlane` since
it's no longer horizontal. `GridHelper` (an opaque three.js helper, not code we swizzle ourselves)
is rotated onto the same plane instead.

## Strand centerline origin

`HairStrandCenterlineCurve`'s root sits exactly at the local origin (x = 0, y = 0, z = 0) - not
sunk below it. From there the curve rises through its emergence bend to become tangent to the
`z = height` plane (`height = thickness * heightFactor`), then runs flat along -Y at that height
for the rest of the strand. `heightFactor` is a `HairStrandParams` field, not a fixed constant, so
callers can vary it per strand (see height variance below). Y is the growth axis (down the card,
from root toward tip) and Z is the rise axis (out of the card's z = 0 plane, toward the viewer) -
see `hair-cards-plan.md`.

## Per-card strand length

A strand's length is no longer a fixed constant - `HairCardStrandsGenerator` sets it to fill the
room between its root and the card's bottom (-Y) edge, minus a small `HAIR_CARD.STRAND.BOTTOM_PADDING`
gap, so strands always span the full card instead of an arbitrary fixed length falling short of it.

## Global thickness

Strand thickness is a single value shared by every card (`Project.thickness`), not a per-card
field - unlike root spread/coverage/height variance. Set via the "Global" section at the bottom of
`HairCardsPanel` (the left sidebar); `Editor.setGlobalThickness` updates `Project.thickness` and
debounce-regenerates every card's strands. It's a workspace preference, not scene data: not part of
`SceneObjectData` and not undoable. It is persisted, though - alongside `name`/`scene` by
`serializeProject`/`loadProject` and the `projects.thickness` DB column - so the slider's displayed
value comes from `useGlobalThickness`, which subscribes to `Editor.addOnProjectChangedListener`
instead of reading `Project.thickness` once, so it picks up the value `loadProject` sets once the
persisted project's fetch resolves.

## Height variance (per card)

`SceneObjectData.heightVariance` (0-1, like root spread) jitters each strand's `heightFactor`
within +/- that fraction of the `HAIR_STRAND.BASE_HEIGHT_FACTOR` baseline, so a card's strands rise
to slightly different heights instead of lining up exactly flat. Edited via `HairCardOptionsPanel`
alongside root spread/coverage, threaded through the same `HairCardStrandSettingsSnapshot`/
`SetHairCardStrandSettingsCommand` undo path.

## Cut variance (per card)

`SceneObjectData.cutVariance` (0-1, like root spread/height variance) randomly shortens each
strand relative to its own full (untrimmed) length - 0 leaves every strand at full length, 1 lets
an individual strand be cut anywhere from full length down to nothing, so a card reads as trimmed
unevenly rather than cut to one exact length. Applied in `HairCardStrandsGenerator` after the
per-strand length is otherwise derived from the room between root and bottom edge, still clamped
to `HAIR_CARD.STRAND.MIN_LENGTH`. Edited via `HairCardOptionsPanel` alongside root spread/coverage/
height variance, threaded through the same `HairCardStrandSettingsSnapshot`/
`SetHairCardStrandSettingsCommand` undo path.

## Root spread vs. coverage naming

`SceneObjectData` has two distinct per-card strand-placement fields, easy to conflate by name:

- `rootSpread` (0-1): what fraction of the card's depth, measured in from its "top" edge, root
  positions are sampled within - where within the card strands can start.
- `coverage` (1-200): how covered/dense the card looks - see "Coverage is a density" below for what
  it actually drives. This used to be called `strandCount`; `coverage` used to mean what
  `rootSpread` means now. Both live on `HairCardStrandsInput`/`HairCardStrandSettingsSnapshot` under
  the same names.

## Coverage is a density, not a strand count

`coverage` doesn't set the strand count directly - `HairCardStrandsGenerator` scales it by
`width * rootSpread` (the root-sampling strip's area), normalized against that same product at the
card's default size (`HAIR_CARD.DEFAULT_WIDTH` x `DEFAULT_ROOT_SPREAD`). A default-sized card's
strand count matches the slider value one-to-one; widening a card, or increasing its root spread,
grows the actual strand count proportionally instead of spreading the same count thinner - the
card's visual density holds steady across a resize rather than drifting with it.

## Strand segment count follows length

A strand's length-segment count isn't a fixed value or a per-strand-configurable field - it's
`length * HAIR_STRAND.SEGMENT_DENSITY` (hardcoded, `HairStrandGeometryGenerator`), floored at
`HAIR_STRAND.MIN_LENGTH_SEGMENTS`. `HairStrandParams` used to carry a `segmentDensity` field for
this, but every caller passed the same constant, so it was dropped in favor of computing segments
straight from `params.length` inside the geometry generator - one less parameter that never
actually varied. This also means a heavily cut strand (see cut variance above) is subdivided less
than an uncut one, instead of carrying the same segment count regardless of how short it ended up.

## Unselected-card visual

A card's default (unselected) visual is a muted rectangle-frame outline
(`EditorController.hairCardOutlineGeometry`/`hairCardOutlineMaterial`, added as a child of each
card's mesh in `Viewport.createHairCardMesh`) rather than a filled translucent plane. The card's
original plane mesh (`hairCardGeometry`/`hairCardMaterial`) still exists and still doubles as the
selection collider, but is now fully invisible (`HAIR_CARD.COLLIDER_OPACITY = 0`) - a pick target
only. The selected-state gizmo (`HairCardWidget`'s brighter outline + handles) is unchanged and
draws on top of this in the overlay scene.

## Card options panel position

`HairCardOptionsPanel` floats at the left (`left-[calc(var(--sidebar-width)+0.75rem)]`), immediately
right of `HairCardsPanel`'s docked sidebar, rather than at the opposite (right) edge of the
viewport - it's contextual to the card list next to it.

## Per-card visibility toggle

Each row in `HairCardsPanel` has an eye-icon `SidebarMenuAction` (always shown while hidden,
hover-only while visible) that flips `ReactBridge.hiddenIdentifiers` for that card via
`setHidden` - the same hidden-set `Editor.hideSelected`/`isolateSelected`/`showAll` already drive.
`Viewport.applyVisibility` mirrors that set onto both the card's own mesh (outline + collider) and
its separately-tracked strand mesh (`hairCardStrandMeshes`, kept outside `sceneObjectsGroup` since
its geometry is swapped independently by `HairCardStrandsController`) - hiding a card hides its
generated hair too, not just its footprint outline.
