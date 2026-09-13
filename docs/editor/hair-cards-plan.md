# Hair cards

Hair cards are editable rectangles containing generated strands. The current implementation covers
the scene model, cards list and options panels, viewport manipulation, strand generation and
modifiers, and project-wide texture baking. See `editor/architecture.md` for the editor foundation.

A hair card is a flat rectangle laid on the vertical working plane (z = 0) that bounds a patch of
generated hair strands. Cards are edited directly in the 3D viewport and baked together, from an
orthographic camera looking straight at the shared working area along Z, into a texture atlas.

## Implemented scope

Cards can be created, positioned, resized, configured, hidden in the editor, and baked into one
project-wide texture set. Each card keeps its own strand parameters and modifier stack.

## Hair card model

A `HairCard` needs, at minimum: an id, and the rectangle's placement on z = 0 (position, rotation
around Z, width/depth) plus per-card strand parameters (reusing or overriding `HairStrandParams`
fields) for the generation step described below. Whether the rectangle is stored as
position+rotation+size or as four independent corner points is still open - four free corners are
the most direct match for "editable corners" in the gizmo, but position+rotation+size is simpler to
keep a true rectangle (right angles preserved) as corners are dragged, and simpler to feed into the
orthographic bake camera. Default to position+rotation+size unless corner-level skew turns out to
be a real requirement.

Following the existing scene-object convention (`SceneObjectData`/`SceneObject` in
`src/editor/main/Project.ts`, currently a single-literal `type: 'cube'`), a hair card should become
a new `SceneObjectData` variant (`type: 'hairCard'`) with its own fields, added to `ProjectScene`
alongside `addCube()` via an analogous `addHairCard()`. `restore`/`replaceAll` already generalize
over `SceneObjectData`, so they don't need special-casing.

## Editor UI

Two new side panels, following `Toolbar.tsx`'s pattern (reads `useReactBridge()`, calls `Editor`
methods) since there's no existing side-panel/inspector component to extend:

- A cards list panel: every `HairCard` in the current `ProjectScene`, click to select.
- A card options panel, shown only while a card is selected: the selected card's editable fields
  (strand params, and whichever of position/rotation/size or corners the model above settles on).

Selecting a card in the list should drive the same selection state the viewport gizmo uses
(`ReactBridge.selectedObjectId`/`selectObject`), so list selection and viewport selection of a card
stay in sync in both directions - selecting in the list selects the gizmo, and selecting the
rectangle in the viewport (via the existing `SelectionInteractionHandler` click path) opens the
options panel.

## Viewport gizmo

A rectangle manipulator, constrained to z = 0, that appears when a hair card is the selection:

- Drag the body: moves the card (translate within the z = 0 plane only - x/y, no z).
- Drag a corner: resizes the card, corners stay right angles per the model decision above.

`SelectionWidget` (`src/editor/main/SelectionWidget.ts`) is a useful reference for how a gizmo
tracks a target and rebuilds its geometry every frame, but it's deliberately non-pickable
(`lines.raycast = () => {}`) since it only ever displays a bounding box. This gizmo needs pickable
corner handles, so it's a new class, not an extension of `SelectionWidget`.

Interaction follows the existing `Tool`/`InteractionHandler` shape (`src/editor/main/tools/`,
`src/editor/interaction/handlers/`): a new tool contributes a new `InteractionHandler` that hit-tests
the corner handles on `MoveStart`, updates the card's size live on `Move`, and commits an undoable
change on `MoveEnd`. `DragManipulationHandler` (the shared base for Translate/Rotate/Scale) is
built around dragging the selected object itself, not a handle on its gizmo, so this is closer to a
sibling of that base than a subclass of it - same capture/apply/commit lifecycle, different hit
target. Card translation (dragging the body) can reuse `TranslateInteractionHandler`'s approach
directly, clamped to z = 0.

## Strand generation inside a card

Once a card's bounds are set, fill it with strands: sample root positions across the card
rectangle, build each strand with `HairStrandGeometryGenerator` as today, oriented so a strand's
local -Y run and root emergence lie against the card's plane. Density, and per-card overrides of
`HairStrandParams`, come from the card options panel.

## Baking

The full hair-card layout bakes once into a shared set of alpha, color, normal, occlusion, height,
tips, roots, and ID textures. The orthographic camera is framed to the complete 0-1 working area,
and each card's local strand geometry is translated to its card's position before all geometry is
merged for rendering.

Card placement in the working area is therefore its placement in the final texture: the lower-left
corner is UV 0,0 and the upper-right corner is UV 1,1. Hidden cards are included because visibility
is editor-only state and does not remove a card from the project.

Every map renders through `HairCardBakeGpuRenderer`'s byte render target with `BAKE.MSAA_SAMPLES`-way
MSAA (`src/constants.ts`) - `WebGLRenderer`'s own `antialias: true` constructor option only ever
applies to the default canvas framebuffer, never to render-to-texture, so this is the only thing that
keeps strand silhouettes (often only a few texels wide) from aliasing hard. The AO pass's float
G-buffer target is deliberately left unsampled - see `HairCardBakeGpuRenderer.getFloatTarget`'s own
comment for why averaging position/normal values at a silhouette is wrong, not just risky.

A bake reports progress per map kind (and, during the `ao` step, per AO sub-sample too) through
`HairCardBakeInput.onProgress`, and can be interrupted mid-flight via `HairCardBakeInput.signal` (an
`AbortSignal`) - `HairCardBakeDialog`'s footer Cancel button aborts an in-flight `'baking'` phase this
way, routing the resulting `AbortError` back to a live form (or the previous result, for a rebake)
rather than through the generic error path. Cancellation is coarse between most map-kind steps, but
fine-grained inside both AO implementations specifically (see below), since AO is the one step slow
enough that a cancel click or the progress label would otherwise never get a chance to run mid-step.

Each persisted map (`Project.bakedMaps`/the `projects.bakedMaps` column, `BakedMapsRecord` in
`HairCardBakeTypes.ts`) carries the resolution it was baked at, alongside its URL. One bake call always
applies one resolution to every map kind it renders (`HairCardBakeRequest.resolution`), so a later
partial re-bake (e.g. only "roots" re-checked) after switching the resolution selector can leave some
kinds at a different resolution than others - `HairCardBakeMapCheckboxCard` shows a second warning
badge, independent of the layout-staleness one, on an already-baked-but-unchecked map whose persisted
resolution doesn't match the one currently selected.

`HairCardBakeDialog`'s completed-bake state (`HairCardBakeMapGrid`) shows a thumbnail per baked map
(object URL from the map's blob, via `useBakeMapObjectUrls`), labelled and sized; hovering a
thumbnail opens a larger preview in a `Tooltip`. `HairCardBakeMapThumbnail` renders the same way for
either shape of `BakeMapPreviewItem` (`src/lib/hair/bake/HairCardBakeMapPreview.ts`) - a freshly
baked map (resolution/size known) or a persisted one reloaded from storage (label/preview only).

Each map's own checkbox (`HairCardBakeMapCheckboxCard`) is a small card too: a thumbnail for that
kind (this session's own fresh bake once one exists, else `Project.bakedMaps`' entry - mirroring the
`projects.bakedMaps` column, loaded by `Editor.loadProject`, see Persistence in
docs/editor/groom-editor-plan.md; a dashed placeholder if neither has that kind) to the left of the
checkbox/label, so reopening the dialog after a reload shows what's already baked per map, not just a
bare checkbox list, and a fresh bake updates it immediately even before any upload finishes. Per-map
options (roots/tips scale, id group count) are always shown below their card, not gated on the
checkbox being checked.

Clicking a card's thumbnail enters a single-map preview: `HairCardBakePreviewRenderer.showSingleMap`
swaps the viewport's quad onto an unlit material showing just that one map (loaded straight from its
URL via three's `TextureLoader`), leaving the default preview material (`showPreview`, see "Preview
material" below) untouched underneath. `HairCardBakePreviewPanel` shows a back-arrow button overlay
while a single-map preview is active; clicking it (or the same card again) calls `exitSingleMap`,
restoring the default preview.

### Occlusion (AO) algorithm

The `ao` map has two interchangeable implementations behind the `HairCardBakeAoAlgorithm` interface
(`src/lib/hair/bake/`), picked by the `BAKE.AO.ALGORITHM` dev flag (`'raytrace'` or `'shadowSweep'`,
`src/constants.ts`) - not user-facing, and not persisted; `HairCardBakeAoAlgorithmFactory` reads it
once per `HairCardBaker` instance.

- `HairCardBakeRaytracedAoPass` - casts cosine-weighted hemisphere rays per texel against a `MeshBVH`
  built from the atlas geometry (CPU raytracing). Yielding to the browser is time-budgeted
  (`BAKE.AO.RAYTRACE.YIELD_BUDGET_MS`) rather than tied to a fixed texel count, since per-texel cost
  varies hugely between a skipped outside-alpha-mask texel and a fully-shaded one.
- `HairCardBakeShadowSweepAoPass` (default, `BAKE.AO.ALGORITHM`) - renders the atlas mesh with a flat
  white, shadows-only material (`HairCardBakeMaterialFactory.createAoShadowMaterial`) under one
  shadow-casting directional light, swept to many positions above the geometry (azimuth arc x a few
  elevation tilts off straight overhead, see `BAKE.AO.SHADOW_SWEEP`), averaging every render into the
  AO value - self-shadowing between strands is the only source of shading. Its shadow map's size
  matches the bake's own resolution (not a fixed constant), so AO quality tracks whatever resolution
  was picked instead of staying pinned to one size; it yields to the browser every
  `BAKE.AO.SHADOW_SWEEP.YIELD_EVERY_N_SAMPLES` sweep samples.

Both read `HairCardBaker`'s shared atlas scene/mesh/camera/renderer/material factory directly rather
than a request-shaped input, so switching algorithms needs no change to `HairCardBakeRequest`. Both
implement `HairCardBakeAoAlgorithm.compute` as `async`, checking an optional `AbortSignal` and
reporting an optional per-sample progress label at each yield point - the one step in a bake slow
enough that this matters (see "Baking" above for how that surfaces in the dialog).

## Preview material

`HairCardBakeDialog` also has 4 color pickers - Primary, Secondary, Tip, Root - persisted on the
project (`Project.previewColors`, the `projects.previewColors` column, client-settable via
`PUT`/`POST /api/projects` like `thickness`) rather than kept as dialog-local form state, since the
groom editor - a separate session reading the SAME project row - needs the same values (see
`GroomHairCardLookup.getPreviewColors`). Editing one calls `Editor.setPreviewColors` immediately, no
separate commit step, same as `setGlobalThickness` (not undoable - a workspace preference, not scene
data).

These colors are never baked into a stored texture themselves. Instead, `HairCardPreviewMapComposer`
(`src/lib/hair/compose/`) composes them on the fly into one "preview material" - the single
implementation behind every "preview"/"textured" surface in the app:

- the groom editor's "Textured" and "Preview" view modes (`GroomToolbar`, alongside Wireframe/
  Wireframe on shaded/Shaded) - these two render identically now, both applying
  `GroomEditorController.cardStripPreviewMaterial`; there's no separate raw-baked-color "Textured"
  material any more (see `GroomViewport.applyViewModeAndGhosting`)
- `HairCardBakeDialog`'s own viewport (`HairCardBakePreviewPanel`), by default, once a bake with
  `alpha` exists (`HairCardBakePreviewRenderer.showPreview`) - the dialog no longer has a separate
  raw-combined-PBR default preview either

`composePreview` (the method both of the above call) does two things: a small offscreen
`WebGLRenderer` renders one full-screen-quad `ShaderMaterial` pass (`composeToCanvas`, read back into
a `CanvasTexture` - see below) that reads the project's baked `alpha`/`id`/`roots`/`tips` maps and
blends

- base color: Primary, or Primary/Secondary smoothly interpolated by the `id` map's own per-strand-
  group grayscale value (`HairCardIdGroupAssigner` already paints it as `(group + 0.5) / groupCount`,
  a smooth [0,1] value - no extra remapping needed)
- Root color blended in by the `roots` map's grayscale falloff, then Tip color by the `tips` map's

into one RGB texture, with the `alpha` map's own grayscale as the output alpha channel; then, if the
project also has a baked `normal` map, it's loaded straight from its URL (unmodified - it isn't
blended with anything) and layered onto the material's `normalMap` slot alongside that composed
diffuse+alpha. `id`/`roots`/`tips` are each independently optional - a project baked without one just
skips that blend step (loading nothing for it and zeroing its blend weight, rather than failing).
`alpha` is the only map `composePreview`/`composeToCanvas` require - the baked `color` map's actual
pixels are never sampled here at all (it's a flat single-color fill with no per-strand signal to
reuse) and plays no part in whether composing can run; `GroomHairCardLookup.getBakeStatus()` matches
this exactly (alpha-only), since it now gates both merged view modes.

The render-target `Texture` a composition pass produces internally can't be handed to a different
`WebGLRenderer` than the composer's own tiny offscreen one - `composeToCanvas` reads it back into a
plain `<canvas>` (flipping WebGL's bottom-to-top rows into `ImageData`'s top-to-bottom order) instead,
and `composePreview` wraps that canvas in a `CanvasTexture`, which - unlike a render target's texture
- three.js can upload into any `WebGLRenderer`. This is what lets one `HairCardPreviewMapComposer`
instance feed materials rendered by entirely separate GL contexts: the groom editor's main viewport
renderer, or `HairCardBakePreviewRenderer`'s own standalone one. Both `ensureCardStripPreviewMap` and
`showPreview` cache the (map URLs, colors) key they last applied and skip recomposing when it hasn't
changed - `HairCardBakeDialog` also surfaces the same composed diffuse+alpha (without the normal map,
which only matters lit in 3D) as a flat thumbnail next to its 4 color pickers
(`HairCardBakePreviewComposedCard`/`useHairCardPreviewComposedCanvas`, via `composeToCanvas` directly)
- a placeholder plus a `TriangleAlert` warning ("Not available - bake alpha first") replaces it while
`alpha` is missing.

Staleness: `Editor.bakeHairCards` fingerprints the exact hair-card layout (id/position/width/
depth) it just baked (`computeHairCardLayoutHash`, `src/lib/hair/bake/HairCardLayoutHash.ts` - a
fast non-cryptographic FNV-1a hash, not security-sensitive) and sends it to the bake route alongside
the map files; the route stores it in the new `bakedMapsSceneHash` column next to `bakedMaps`, so a
partial re-bake (e.g. only "roots" re-checked) still refreshes the hash, since baking always renders
every card's current full geometry regardless of which map kinds were requested. `GroomHairCardLookup
.getBakeStatus()` recomputes the same hash from the object-editor scene it already reads for UV
rects and compares it against the stored one: `'stale'` on a mismatch, `'fresh'` otherwise (a null
stored hash - a bake predating this feature - is never treated as stale). `GroomStatusBar` shows a
warning ("maps aren't baked yet" / "cards moved since the last bake") whenever the active view mode
is "Textured" or "Preview" and the status isn't `'fresh'`.

The object editor's own `HairCardBakeDialog` tracks the same idea locally: `Project.bakedMapsSceneHash`
mirrors the same-named column and is set by `Editor.bakeHairCards` on every bake (regardless of
whether `HairCardBakeDialog` goes on to upload the result, so an unsaved `/editor` scratch session
still clears it). `Editor.isHairCardsBakeDirty()` compares it against the current card layout's hash
the same way `GroomHairCardLookup.getBakeStatus` does, and `useHairCardsBakeDirty` (a
`useSyncExternalStore` hook over `Editor.addOnProjectChangedListener`, alongside `useGlobalThickness`/
`useSceneObjectIds`) re-renders `HairCardBakeDialog` on every card change. Since one bake renders every
card's current full geometry regardless of which map kinds were checked, dirtiness applies uniformly
to every map kind - `HairCardBakeMapCheckboxCard` shows a `TriangleAlert` badge next to its label
whenever it's dirty AND already has a `previewUrl` (nothing to warn about for a map that's never been
baked).
