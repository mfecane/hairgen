# Groom editor

A second, fully separate editor at `/editor/[projectId]/groom` for authoring guide splines and
instancing hair cards along them, on a sphere (a head/scalp proxy). This doc covers what's
implemented today: placing a multi-vertex spline, a per-vertex position/rotate/scale gizmo (with an
opt-in "smooth modify" falloff onto neighbors), a "card strip" instancing the referenced hair card
along the curve with a wireframe/wireframe-on-shaded/shaded/textured view mode and selection-driven
ghosting, and adding/deleting points either from the toolbar or by clicking the curve itself. See
`docs/editor/hair-cards-plan.md`/`docs/editor/architecture.md` for the pre-existing object editor
this one deliberately does not share code or data with.

## Why a second, separate editor

The groom workflow (guide splines wrapped around a 3D head/scalp proxy) is a genuinely different
editing domain from hair cards (flat rectangles on a bounded working plane, baked to a texture
atlas). Rather than extending the object editor's `EditorMode` seam (which exists for a mode that
still shares the same `Viewport`/`Project`), this was built as a parallel, independently-routed
editor: its own root class, project model, viewport, tools, undo history, and a dedicated `groom`
jsonb column - so the two editors' data, history, and rendering never interact. The only shared
code is genuinely generic engine plumbing (`CanvasEventHandler`, `InteractionHandlerRouter`,
`HitTester`, `SceneObjectRef`, `ElementResizeObserver`, `CameraUpdateController`,
`HistoryController`, `OrbitInteractionHandler`).

## Data model

`src/editor/groom/main/GroomProject.ts`:

- `SplineVertexData { position: Vector3Data; direction: Vector3Data; scale: number }` - `direction`
  defaults to world up (`GROOM.SPLINE.DEFAULT_VERTEX_DIRECTION`) or the scalp surface normal at
  placement, and is edited via the rotate gizmo (rotates around the vertex's tangent - see "Vertex
  gizmo" below). `scale` is a single scalar (`GROOM.SPLINE.DEFAULT_VERTEX_SCALE`), edited via the
  scale gizmo.
- `SplineObjectData { id; vertices: SplineVertexData[]; hairCardId: string | null; resolution: number; cardWidth: number; cardStartOffset: number; smoothModifyEnabled: boolean; influence: number }`
    - `vertices` is a list (not a fixed 2-tuple) since multi-point splines are the eventual point of
      this system, even though the placement tool always creates exactly 2 - "Add point"/clicking the
      curve/"Delete point" (see "Adding/removing a vertex" below) are how a spline grows/shrinks past
      that.
    - `hairCardId` references a `HairCard`'s id in the _other_ (object editor) project's `scene` -
      there's no local copy or validation that the id still exists; `SplineOptionsPanel`'s dropdown
      picks it, and `GroomHairCardLookup` (see "Card strip" below) resolves it to a texture at render
      time. It only ever affects the card strip's UVs/texture - never its physical size, see
      `cardWidth` below.
    - `cardWidth` (`GROOM.SPLINE.CARD_STRIP.DEFAULT_WIDTH`) is the card strip's own width in world
      units, edited via `SplineOptionsPanel`'s "Card width" field - deliberately independent of
      whichever hair card `hairCardId` references, so swapping the referenced card never resizes the
      mesh.
    - `resolution` (`GROOM.SPLINE.DEFAULT_RESOLUTION`) is curve subdivisions per world unit, edited
      via `SplineOptionsPanel`; larger values produce finer geometry. The actual subdivision count
      drawn is never stored directly - it's inferred from the spline's length multiplied by `resolution`
      (`SplineObject.getSubdivisionCountForResolution`, clamped to `GROOM.SPLINE.MIN/MAX_SUBDIVISIONS`),
      so it stays in sync automatically as a vertex is dragged and the spline's length changes.
      `GroomScene.restore` converts persisted values below `1` from the former world-units-per-segment
      representation by taking their reciprocal.
    - `cardStartOffset` (`GROOM.SPLINE.CARD_STRIP.DEFAULT_START_OFFSET`) is arc-length world units
      from the curve's own start where the card strip begins - it always ends exactly at the curve's
      end regardless of this value. Edited via `SplineOptionsPanel`, consumed by
      `SplineCardStripGeometryGenerator`.
    - `smoothModifyEnabled`/`influence` (`GROOM.SPLINE.SMOOTH_MODIFY.DEFAULT_*`) control whether/how
      strongly a move, rotate, or scale drag on one vertex also transforms its neighbors - see "Soft
      selection falloff" below. Edited via `SplineSmoothModifyPanel`, persisted per-spline like `resolution`
      rather than as ephemeral UI state, since they're authoring settings that should survive reload
      and vary spline-to-spline.
- `GroomScene`/`GroomProject` mirror `ProjectScene`/`Project` field-for-field (`addSpline`,
  `restore`, `remove`, `get`, `getItems`, `toJSON`, `replaceAll`). `GroomProject` has no
  `id`/`name`/`thickness` of its own - the groom scene is one jsonb column on the _same_ `projects`
  row the object editor's `scene`/`thickness` live on (see Persistence below).

## Root classes

`src/editor/groom/main/GroomEditor.ts`/`GroomEditorController.ts` mirror `Editor`/`EditorController`
with one simplification: no `ModeController`/`EditorMode`. The groom editor only ever has one
tool-set, so `GroomEditorController` hosts three tools directly, reproducing `ObjectMode`'s
"always-on tool(s) + one exclusive extra tool" shape inline:

- `SplineSelectTool` (always active) - click-to-select/deselect.
- `SplineVertexDragTool` (always active) - the selected spline's vertex-drag gizmo.
- `PlaceSplineTool` (toggled via `GroomEditor.setActiveTool('select' | 'placeSpline')`) - single-
  click placement.

`GroomEditorController.history` is a **separate `HistoryController` instance** from the object
editor's - undo/redo in one editor never touches the other's stack. `getGroomEditorSession()`
(`GroomEditorSession.ts`) is a separate module-level singleton from `getEditorSession()`.

## Viewport

`GroomViewport` (`src/editor/groom/main/GroomViewport.ts`) mirrors `Viewport.ts`'s constructor
shape (scene/camera/renderer/controls/`ViewHelper`/resize observer) but has no hair-card system and
no bounded working area, and no rendered ground grid - `GroomPlanes.GROUND_PLANE` (the XZ plane at
y = 0) is purely a math plane splines are placed on and dragged along, with nothing drawn for it.

**Scalp proxy**: a sphere (`GROOM.SCALP`, center at `y = RADIUS` so it sits on the ground plane)
gives splines something to be placed against. `GroomScalp.ts`'s `SCALP_SPHERE` (a plain three.js
`Sphere`) is the math object handlers raycast against
(`InteractionContext.intersectSphere`, mirroring `intersectPlane`); `GroomViewport`'s `scalpMesh` is
a purely visual twin kept in sync with the same center/radius, untagged and not hit-testable
(`raycast = () => {}`) - it's a backdrop, not a pickable scene object, and always fully opaque (the
"base mesh") regardless of view mode/selection - unlike a spline's card strip, nothing ever ghosts or
wireframes it. `PlaceSplineInteractionHandler`
tries the sphere first and falls back to the ground plane when a click misses it, so placement still
works off to the sides. When the click lands on the scalp, the new spline is oriented normal to it
(outward along the sphere radius at the hit point, computed as `hitPoint - SCALP_SPHERE.center`
normalized) instead of `GROOM.SPLINE.DEFAULT_DIRECTION` - both `GroomScene.addSpline`'s second
vertex placement and both vertices' `direction` fields use this normal when given one; a
ground-plane-only placement keeps the old fixed direction and world-up vertex direction, since
"normal to the scalp" doesn't apply off it. The normal travels from handler to model through
`GroomEditor.addSplineAt(position, normal)` and `AddSplineCommand`'s extra constructor argument.
The first vertex's position drag (`SplineVertexDragInteractionHandler`) stays constrained to the
scalp sphere surface - a raw `intersectSphere` raycast, falling back to the ground plane when the
ray misses it (the same technique `PlaceSplineInteractionHandler` uses, with no grab-offset
preservation, so it always tracks the raycast hit exactly and never leaves the sphere). Every other
vertex drags in 3D within a screen-facing plane through it, via the new
`InteractionContext.intersectViewPlane` - "in screen space aligned to the current view" rather than
locked to the ground plane.

**Spline body - curve + invisible collider + card strip**: each spline's body (`splineObjectsGroup`'s
children) is a `Group` (`SplineBodyGeometry.ts`'s `createSplineBodyGroup`, tagged via
`tagSceneObject`) holding four meshes built from the same smooth curve: a visible `Line` tracing it
(always `raycast`-disabled, purely visual), an invisible `TubeGeometry` mesh extruded along it, and
the card strip's shaded/textured/ghost `Mesh` (also tagged) plus a `cardStripWireframe` `Mesh`
(always `raycast`-disabled) sharing its geometry (see "Card strip, view modes, ghosting" below).
Exactly one of the collider/card-strip pair is pickable at a time, toggled every frame by
`setSplineBodyPickable` (called from `GroomViewport.applyViewModeAndGhosting`, which already knows
per-spline selection state): unselected, the card strip itself is pickable, so a click anywhere on
the visible card selects it - the collider's fixed `BODY_WIDTH` radius can be narrower than a wide
card strip, so relying on it alone missed clicks near a card's edges; selected, the card strip stops
being pickable and the collider takes over, since it's what `SplineSelectionInteractionHandler` uses
to insert a new vertex at the clicked point along the curve - a gesture that only makes sense once
the spline is already selected. All four meshes are rebuilt (not just
transformed) from the group's live vertex/direction/scale arrays, stored in
`group.userData.splineVertices`/`splineVertexDirections`/`splineVertexScales` (see
`SplineBodyGeometry.ts`'s `setSplineBodyVertices`/`getSplineBodyVertices`/`updateSplineBodyGeometry`)
- the same "the mesh is the live truth during a drag" pattern hair cards use
(`HairCardMoveInteractionHandler` mutates the card mesh directly; the persisted model isn't touched
until the drag commits). `SplineCurveGeometryGenerator` builds a `CatmullRomCurve3` through every
vertex (centripetal parameterization, to avoid loops/overshoot) - replacing the earlier vertex-to-vertex
linear interpolation, which visibly kinked at every interior vertex instead of flowing smoothly
through it - then samples it into the line's points and the collider tube's geometry, both subdivided
per `SplineObject.getSubdivisionCountForResolution`; `SplineCardStripGeometryGenerator` samples the
SAME curve for the card strip (see below). The collider tube's radius is a constant
`GROOM.SPLINE.BODY_WIDTH / 2` - unlike the old ribbon, the per-vertex `scale` field no longer shapes
the collider's width (only the card strip's width uses it - see below). Every
vertex-drag/rotate/scale interaction handler calls `updateSplineBodyGeometry`
again on every `Move` step, since a resize, a rotate, or a scale drag can each change the curve's/
card strip's shape.

**Card strip, view modes, ghosting**: `SplineCardStripGeometryGenerator.ts` builds the visible,
textured ribbon of quads instancing a spline's referenced hair card - a flat strip, not a strand tube
(the object editor's hair cards render as individual strand tubes in the viewport; this is a
different, simpler "bent flat card" instancing scheme). It samples the same `CatmullRomCurve3`
`SplineCurveGeometryGenerator` builds, starting `cardStartOffset` arc-length units into the curve and
always ending exactly at the curve's end (clamped defensively inside the generator itself against
`GROOM.SPLINE.CARD_STRIP.MIN_REMAINING_LENGTH`, never trusting the persisted offset blindly since a
shortened spline could otherwise produce degenerate geometry); each cross-section's width axis is
lerped between the bracketing pair of vertices' own `getVertexGizmoFrame(...).axis`, and its
half-width is `cardWidth * lerp(scaleA, scaleB, t) / 2` - reinstating `scale`'s visual effect on
the body. Vertex arc length is found by interpolating `curve.getLengths()`'s own (200-division)
table at each vertex's known parameter `k/(n-1)`, rather than a coarser vertex-count-sized table -
using two different-resolution arc-length tables for the cross-section spacing vs. the vertex
lookup would silently desync once a spline actually curves. `cardWidth` is the spline's own field
(`SplineObject.cardWidth`, edited via `SplineOptionsPanel`) - the referenced hair card is deliberately
never consulted for width, only for UVs/texture, so picking a different card in the dropdown can
never resize the strip. `GroomHairCardLookup` (`GroomEditor.hairCardLookup`) exists only for the
baked texture maps, populated from the object-editor project's `bakedMaps` field whenever
`GroomEditor.loadProject` runs - `useGroomProjectPersistence` already fetches the whole `projects`
row, so no new fetch was needed, just widening `loadProject`'s accepted shape.

The card strip mesh and its `cardStripWireframe` sibling share one `BufferGeometry` instance (the
standard three.js shaded+wireframe-overlay pair). `GroomEditorController` owns the shared materials -
`cardStripShadedMaterial` (fixed white, not theme-tinted, same reasoning as
`EditorController.hairCardStrandMaterial`), `cardStripPreviewMaterial` (`ensureCardStripPreviewMap`
lazily composes the project's baked maps + preview colors onto it, applied in the "Textured" view
mode - see below), `cardStripGhostMaterial` (dim, themed), `cardStripWireframeMaterial`
- each with `polygonOffset` set, since the curve `Line` runs exactly along the strip's centerline
(genuinely coincident geometry, not just close): `renderOrder` (`line: 1`, `cardStrip: 0`, set once in
`createSplineBodyGroup`) fixes draw order, but only `polygonOffset` on the strip's materials reliably
prevents z-fighting flicker on truly coincident geometry across GPUs.

`GroomViewport.render()`'s `applyViewModeAndGhosting` (reading `GroomReactBridgeState.viewMode`,
`GroomViewMode = 'wireframe' | 'wireframeOnShaded' | 'shaded' | 'textured'`,
alongside `selectedObjectIds` every frame) applies, per spline body: a ghosted (unselected while
something else is selected) card strip is dim, never shows wireframe/texture detail, and hides its
curve line entirely - the ghost alone represents it. A non-ghosted (selected, or nothing selected)
card strip follows `viewMode` (hidden in pure `'wireframe'`, wireframe overlay shown in
`'wireframe'`/`'wireframeOnShaded'`, `cardStripPreviewMaterial` applied in `'textured'`
- see below), and its curve line shows only while selected (or always, for a spline with no
card strip yet to represent it instead). The curve line's color (`GroomEditorController.splineLineMaterial`)
matches `SplineVertexWidget`'s position-handle color (`EDITOR_SCENE_COLORS[theme].splineVertexWidget`)
rather than a separate neutral gray, since it's only ever shown alongside that same vertex gizmo. The
scalp proxy ("base mesh") is untouched by any of this - opaque unconditionally, see below.

`'textured'` applies `cardStripPreviewMaterial`, composed by `ensureCardStripPreviewMap` from
`HairCardPreviewMapComposer` (see docs/editor/hair-cards-plan.md's "Preview material" section for
what it composes: the project's alpha/id/roots/tips bakes + its 4 preview colors, plus the baked
normal map layered on unmodified if one exists). There used to be a separate `'preview'`
`GroomViewMode` value/toolbar entry alongside `'textured'` - both rendered identically (there's no
raw-baked-color material distinct from the preview-colored one), so the duplicate entry was removed.
`GroomHairCardLookup.getBakeStatus`/`GroomStatusBar` show the "maps aren't baked yet"/"cards moved
since the last bake" warning while `'textured'` is active and the project's bake is missing (no
`alpha`) or stale; with no `alpha` baked at all, it falls back to plain shaded.

**Vertex gizmo**: `SplineVertexWidget` mirrors `HairCardWidget`'s visible/collider mesh-pair
pattern exactly (small visible sphere, `raycast` disabled; larger transparent collider, tagged and
actually picked). Both use explicit constant-screen-size diameters
(`POSITION_HANDLE_SCREEN_DIAMETER` and `POSITION_HANDLE_COLLIDER_SCREEN_DIAMETER`) - these are every
vertex's always-shown position handles. The handle pool is resized to the selected spline's own
vertex count on every `update()` (`ensureHandleCount`, mirroring `GroomViewport.syncSplineObjects`'s
add/remove reconciliation) rather than fixed at 2 - see "Adding a vertex" below for how a spline
grows past its initial 2. `SplineVertexRef.ts`'s `tagSplineVertex`/`tryGetSplineVertex` identify
which spline/vertex/
handle-kind (`'position' | 'rotate' | 'scale'`) a handle belongs to, alongside the generic
`tagSceneObject` tag (so a plain click on a handle still selects rather than deselecting -
`SplineSelectionInteractionHandler` only ever looks at the generic tag for selection, though it also
reads the vertex tag to activate that vertex - see below).

One vertex at a time can additionally be "active" (`GroomReactBridgeState.activeVertexIndex` - null
while nothing/multiple splines are selected, defaults to `0` on a new selection/placement, and
follows whichever vertex handle was last clicked or dragged, via `GroomEditor.setActiveSplineVertex`).
The active vertex shows `SplineVertexGizmo`'s rotate + scale handles, a sibling class to
`SplineVertexWidget` (different contract: at most one vertex's extra handles, not a fixed pool for
every vertex). Every visual and collider dimension is an explicit screen-space size; camera
distance is used only to convert those dimensions to world space. Both handles are oriented from
`SplineVertexFrame.getVertexGizmoFrame`, the one shared definition of a vertex's tangent, its
tangent-perpendicular `axis` (the vertex's own `direction`, Gram-Schmidt'd against the tangent, with
a world-axis fallback for the (near-)parallel case a freshly placed scalp spline starts in), and
`axisB` (`tangent` × `axis`, purely for the rotate handle's grab-sphere placement below). The rotate
handle is a thin, purely visual torus ring whose plane is perpendicular to the tangent ("tangent to
curve" - orienting the ring means rotating its local Z, not Y, onto the tangent, since that's the
axis `TorusGeometry` lies flat around) plus a small grab-sphere sitting on the ring along `axisB`
(offset from the scale handle so the two never overlap); dragging that sphere spins `direction`
around the tangent (`SplineVertexRotateInteractionHandler`, which itself derives its own rotation
math from `tangent`/`axis`/`axisB`, independent of exactly where on the rotation plane the drag is
picked up). The scale handle is a thin, purely visual line (a narrow cylinder) along `axis` ("normal
to spline, aligned with the vertex's recorded rotation") with a fixed screen-space length,
independent of the live `scale` value, running from the vertex's own position (the gizmo's origin,
same as the rotate ring's center) straight out to a knob-sphere at its tip - no gap between
origin/line/knob (`SplineVertexScaleInteractionHandler`).
Only the two grab-spheres
(and every `SplineVertexWidget` position handle) are ever pickable - each is the
small-visible-sphere/larger-invisible-collider pair `SplineVertexWidget` also uses. Both rotate and
scale use the same explicit `GIZMO_KNOB_SCREEN_DIAMETER` and
`GIZMO_KNOB_COLLIDER_SCREEN_DIAMETER`, so their visible knobs and hit targets match exactly. Every
handle (ring+rotate-sphere
together, line+scale-sphere together, or one position sphere) turns `GROOM.SPLINE.HANDLE_HOVER_COLOR`
while the pointer sits over its collider - tracked by `SplineHoverInteractionHandler` (a passive,
always-`setPass()` handler that just calls `GroomViewport.setHoveredHandle` on every `Hover` event)
and fed into both widgets' `update()` every frame. Both rotate/scale handlers use the same
MoveStart-anchored grab-offset lifecycle as the position drag, against a plane/axis fixed for the
gesture (the vertex doesn't move during a rotate/scale drag). `SplineBodyTransform.ts`'s
`setSplineVertexDirections`/`getSplineVertexDirections`/`setSplineVertexScales`/
`getSplineVertexScales` give `direction`/`scale` the same live-array-on-`mesh.userData` "truth during
a drag" home the vertex positions already had, populated by `GroomViewport.syncSplineObjects`
alongside `setSplineBodyVertices`.

All three per-vertex commits funnel into one `TransformSplineVertexCommand`/
`GroomEditor.commitTransformSplineVertex` (position + direction + scale bundled into one snapshot,
mirroring the object editor's `TransformObjectCommand`) rather than three parallel single-field
commands - unless soft selection is on and the drag touched more than the one dragged vertex, see
"Soft selection falloff" below.

**Soft selection falloff**: `SplineSmoothModifyPanel`'s "Soft selection" switch + "Influence"
ratio slider sit in a compact panel directly below `GroomToolbar`. The panel is visible whenever
exactly one spline is selected and does not depend on an active vertex. The persisted settings make
a move, rotate, or scale drag on the active vertex also transforms its neighbors, tapering with distance.
`SplineSmoothModifyFalloff.ts`'s `computeSmoothModifyWeights(vertices, draggedIndex, influence)`
returns a `Map<neighborIndex, weight>`: cumulative polyline distance from the dragged vertex (the
same straight-segment approximation `insertVertexNearPoint` already uses elsewhere), a raised-cosine
falloff scaled by `influence`, zero beyond `GROOM.SPLINE.SMOOTH_MODIFY.FALLOFF_RADIUS`. The position,
rotate, and scale handlers capture this weight map once at `MoveStart` along with each neighbor's
relevant starting state when the dragged spline's `smoothModifyEnabled` is on;
every `Move` step re-applies the dragged vertex's own fresh, non-cumulative delta to each neighbor
scaled by its weight (rotate: around the **neighbor's own** tangent, not a copy of the dragged
vertex's world-space rotation - each neighbor has its own `getVertexGizmoFrame`); `MoveEnd` bundles
every vertex that actually changed (the dragged one plus any touched neighbors) into one new
`TransformSplineVerticesCommand`/`GroomEditor.commitTransformSplineVertices`, a sibling to the
singular per-vertex command rather than a widened version of it - this codebase already prefers one
command class per distinct gesture shape (`AddSplineCommand`/`AddSplineVertexCommand`/
`InsertSplineVertexCommand` are three separate classes) over one parameterized class. With the switch
off, `this.neighbors` is never populated, so both handlers fall through to the exact same single-
vertex `commitTransformSplineVertex` call they always made - "off" behavior is bit-for-bit identical
to before this feature existed.

**Adding/removing a vertex**: the toolbar's "Add point" button (`GroomToolbar`, shown only while exactly one
spline is selected) calls `GroomEditor.addVertexToSelectedSpline`, which pushes an
`AddSplineVertexCommand` (`GroomScene.addVertexToSpline` on first `execute()`, replayed verbatim on
redo rather than re-extrapolated) and activates the new vertex's gizmo right away. The new vertex is
placed `GROOM.SPLINE.NEW_VERTEX_OFFSET` past the spline's current last vertex, along the direction
from its second-to-last vertex (falling back to `GROOM.SPLINE.DEFAULT_DIRECTION` for a spline that
only has one vertex, or whose last two are coincident) - inheriting that last vertex's `direction`/
`scale` rather than resetting to the defaults, so the new tip's gizmo doesn't visually "jump." This
is what pushed every vertex-count-2 assumption elsewhere out of the codebase: `SplineVertexFrame
.getSplineVertexTangent` now takes a central difference across both neighbors for an interior vertex
(falling back to whichever single neighbor exists at an endpoint - the same vector the original
2-vertex-only version used for both its endpoints), `SplineCurveGeometryGenerator` samples its
`subdivisions` cross-sections at equal arc-length intervals along the whole `CatmullRomCurve3`
(rather than lerping directly between exactly 2 vertices), and `SplineVertexWidget`'s handle pool is
resized to the live vertex count instead of fixed at 2 (see "Vertex gizmo" above). The
vertex-drag/rotate/scale interaction handlers needed no changes - they already operated on
`tag.vertexIndex` generically, with only vertex 0 (`FIRST_VERTEX_INDEX`) ever special-cased for the
scalp-sphere constraint.

A spline can also grow a vertex by clicking directly on its curve: a plain (non-shift) click on the
body - not a vertex handle - while that spline is the sole selection calls
`GroomEditor.insertVertexAtPoint`, which pushes an `InsertSplineVertexCommand`
(`GroomScene.insertVertexNearPoint` on first `execute()`, replayed verbatim on redo). It finds the
closest point across the spline's existing straight-line segments to the click (a polyline
approximation of the smooth curve actually drawn - good enough to pick which pair of vertices the
click landed between), splits that segment there, and lerps the new vertex's `direction`/`scale`
between its two new neighbors. A click on a not-yet-selected spline's body still just selects it
first, same as before - the insert gesture only fires on a second click, once the spline is already
selected.

**"Add point" overlay button**: while exactly one spline is selected, a floating `+` button
(`AddPointButton.tsx`) is pinned in the viewport at the screen position where
`GroomEditor.addVertexToSelectedSpline` would place the next vertex - the same extrapolated position
as "Adding/removing a vertex" above, just shown as a clickable affordance before the click happens.
`AddPointAnchor.ts` owns an empty `Object3D` (no geometry of its own) that `GroomViewport.render()`
repositions every frame to that extrapolated point, reading the selected spline's live mesh vertex
array (`getSplineBodyVertices`) the same way `SplineVertexWidget` does, so it tracks a drag in
progress too; it's hidden whenever the anchor has no meaningful position (nothing, or more than one
spline, selected). `AddPointAnchor.getScreenPosition` projects it to CSS pixels relative to the
viewport's mount element (returning `null` off-frustum/behind-camera). It's also hidden - its screen
position reported as `null` - for as long as the curve-hover insert hint (below) is showing instead,
and rendered offset from its own anchor point by `GROOM.SPLINE.CURSOR_OVERLAY_OFFSET_PX` CSS pixels
rather than centered exactly on it, so the button itself never covers the point it's pointing at, nor
sits directly under the OS cursor icon (`SplineCurveInsertHint`'s dot, below, uses the same offset for
the same reason).

That position is deliberately NOT pushed through `GroomReactBridge`/`setState`: the WebGL canvas
redraws synchronously every `requestAnimationFrame` tick, but a state update only takes effect on
React's next scheduled re-render/commit, so routing a continuously-changing value (this one changes
every frame while orbiting with a spline selected) through the bridge visibly lagged the button a
frame behind the canvas it's supposed to track. Instead, `GroomViewport.subscribeAddPointScreenPosition`
(a stable, `this`-bound arrow field, called once the frame's render calls have run so the
camera/object matrices `getScreenPosition` reads are current) is a plain listener registry -
`useLiveElementPosition` (`src/editor/hooks/useLiveElementPosition.ts`, generic and reusable for any
future "live" overlay element, not groom-specific) subscribes a DOM ref to it in a `useEffect` and
writes `style.left`/`style.top`/`style.display` straight onto the node from the callback, bypassing
`setState` entirely. `AddPointButton.tsx` still renders as a normal React component (mount/unmount,
icon) - only its hot per-frame coordinate write skips React's render cycle. Its own `className`
overrides shadcn `Button`'s base `transition-all` with `transition-none` for the same reason - a CSS
transition on `left`/`top` would otherwise smooth out (and visibly lag) every one of those writes.

The button doesn't commit a point on its own click - it's a two-click gesture, the exact same
"toggle a tool, place on the next click" shape as `PlaceSplineTool`/`GroomToolbar`'s "Place Spline"
button: clicking it arms a momentary `'addVertex'` `GroomActiveTool`
(`GroomEditor.beginAddVertexToSelectedSpline`, a no-op unless exactly one spline is selected), which
also captures `getAddVertexAnchorPosition()` - the spline's current extrapolated next-vertex position
(the same point the button itself sits on, `SplineObject.getNextVertexPosition()`) - and installs
`AddSplineVertexInteractionHandler` (`AddSplineVertexTool.ts`, priority 110, above
`SplineSelectionInteractionHandler`) into the viewport's handler list. The next click in the viewport
raycasts against the screen-facing plane through that captured anchor
(`InteractionContext.intersectViewPlane` - the same "drag in screen space aligned to the current
view" technique every other vertex's position drag already uses, see "Vertex gizmo" below), not the
scalp/ground plane: the new point lands at the depth the user was looking at when they clicked the
button, not wherever a sphere/ground raycast happens to hit. It then calls
`GroomEditor.commitAddVertexAt(splineId, point)` - `GroomScene.appendVertexToSplineAt`/
`AppendSplineVertexAtCommand` mirror `addVertexToSpline`/`AddSplineVertexCommand` exactly except the
position is the click's raycast hit rather than a fixed extrapolated offset - then returns to the
`'select'` tool. A click that can't resolve to a point (the selection changed mid-gesture, or the ray
is parallel to the view plane) calls `GroomEditor.cancelAddVertexToSelectedSpline()` instead, which
also just reverts to `'select'` without adding anything; so does any pointerdown outside the
viewport's own mount element entirely (`GroomViewport`'s document-level `handleGlobalPointerDownBound`) -
a click on a toolbar/panel, or anywhere else on the page, while armed.

While armed, `AddPointButton` itself hides (it's already served its purpose) and
`GroomViewport.render()`'s tool-change listener sets the canvas's CSS cursor to `crosshair` - the
mode's only other visual feedback, since nothing else in the viewport otherwise indicates the next
click behaves differently.

**Curve-hover "insert point" hint**: while a spline is selected, its collider tube becomes pickable
(see above) so a plain click on the body inserts a vertex there - but the tube itself is invisible,
so nothing signals where a click would land until the hint exists. `SplineHoverInteractionHandler`
now also reports a non-vertex hover hit on the selected spline's own body to
`GroomViewport.setHoveredCurvePoint(splineId, rawPoint)`, which looks up that spline's body group and
calls `SplineBodyGeometry.findClosestPointOnSplineBody` - the raw hit lands on the tube's surface, not
its centerline, so this infers the hit's parameter t along the curve by sampling the same
`CatmullRomCurve3` cached on the group by `updateSplineBodyGeometry` at even arc-length spacing and
snapping to the nearest sample, rather than trusting the raw hit point directly. `CurveInsertHintAnchor`
(a plain `Object3D`, mirroring `AddPointAnchor`'s shape - including its screen-projection math,
deliberately duplicated rather than shared) is repositioned there every frame and its screen position
pushed straight to subscribers (`GroomViewport.subscribeCurveInsertScreenPosition`) the same
bypass-`setState` way `subscribeAddPointScreenPosition` is, for the same reason. `SplineCurveInsertHint.tsx`
renders a small floating dot at that live position via `useLiveElementPosition` - unlike
`AddPointButton`, it has no `onClick` and is `pointer-events-none`: it's purely a notice that clicking
here inserts a point at the current hover position, and must never itself intercept the hover/click
it's describing. Showing it alongside `AddPointButton`'s "add point at the end" affordance at the same
time would suggest two different insert positions at once, so `GroomViewport.render()` hides the
"add point" button's screen position (reports `null`, which `useLiveElementPosition` renders as
`display: none`) for as long as a curve hover point is active.

The collider tube is only ever a real raycast target - `setSplineBodyPickable`'s
`curveEditingModeActive` argument, `activeTool === 'select'` - while the spline's the sole selection
AND no other tool (`'placeSpline'`/`'addVertex'`) owns clicking; those tools' own handlers never
consult the hitTester anyway (`PlaceSplineInteractionHandler`/`AddSplineVertexInteractionHandler`
raycast a plane/sphere directly), but leaving the collider pickable regardless would still make it a
spurious hover target. `GroomViewport.setHoveredCurvePoint` re-checks the same condition itself
(`activeTool === 'select'` and `splineId` is exactly the sole selected spline) before resolving to a
non-null point - both an unselected spline's own pickable card strip (used for re-selecting it, see
`setSplineBodyPickable` above) and a spline that's merely part of a multi-selection must never show
the hint, since clicking either wouldn't actually insert a point.

**Raycast-target hygiene**: three.js' `Raycaster` never consults an object's `.visible` flag - only
`.raycast()` itself decides whether it's hit, which is why every collider/pickable mesh in this
editor is toggled by replacing `.raycast` with a no-op rather than by hiding it. `SplineVertexWidget`/
`SplineVertexGizmo` used to violate this for their own handle colliders: hiding the widget only ever
set `group.visible = false`, leaving the position-handle pool (or the rotate/scale grab-spheres)
sitting at their last-known position - or, for the gizmo, its pre-first-`layout()` origin - as live,
invisible, still-pickable geometry. `SplineVertexWidget.update` now shrinks its handle pool to 0 on
deselect (reusing `ensureHandleCount`, which already supports growing/shrinking it) instead of
leaving stale handles behind; `SplineVertexGizmo` now has its own `setHandlesRaycastable`, toggling
both grab-sphere colliders' `.raycast` (starting disabled in the constructor, alongside every
`group.visible = false` in `update()`) the same no-op way `SplineBodyGeometry` already does for the
spline body's own meshes.

The inverse - "Delete point" in `GroomToolbar` - calls
`GroomEditor.deleteActiveSplineVertex`, which pushes a `DeleteSplineVertexCommand` (mirrors
`AddSplineVertexCommand`'s lazy-capture-then-replay shape, inverted) removing the active vertex, then
clamps `activeVertexIndex` back into range rather than clearing it so the gizmo stays visible on a
neighbor. A no-op (and disabled in both UIs) once a spline is down to `GROOM.SPLINE.MIN_VERTEX_COUNT`
(`2`) vertices.

## Interaction handlers (priority, descending)

`PlaceSplineInteractionHandler`/`AddSplineVertexInteractionHandler` (110, mutually exclusive - only
one of `'placeSpline'`/`'addVertex'` is ever the active tool at a time) > `SplineSelectionInteractionHandler`
(100) > `SplineVertexDragInteractionHandler`/`SplineVertexRotateInteractionHandler`/
`SplineVertexScaleInteractionHandler` (70, order-independent - each filters on the vertex handle's
`kind` tag and `setPass()`s on a mismatch) > `OrbitInteractionHandler` (1, always present).

`GroomViewport.hitTester` is given its pickable roots as two ordered priority tiers, not one flat
list (`HitTester.setTargets(tiers: Object3D[][])`): `[splineVertexWidget.handleGroup,
splineVertexGizmo.handleGroup]` before `[splineObjectsGroup]`. The first tier with any intersection
wins outright, so a vertex handle is always pickable even when it's geometrically behind (or inside)
a spline's own collider tube from the camera's point of view - the same precedence the overlay
scene's depth-cleared second render pass already gives the widgets visually (see
`GroomViewport.render`) now also applies to hit-testing, rather than leaving it to whichever object
happens to be closer along the ray. The object editor's `Viewport` was widened the same way
(`[hairCardWidget.handleGroup]` before `[sceneObjectsGroup]`) for the same reason.

- Placing: one click raycasts against the ground plane and calls `GroomEditor.addSplineAt(point)`,
  which places vertex A there and vertex B at a fixed offset (`GROOM.SPLINE.DEFAULT_DIRECTION *
DEFAULT_LENGTH`) - mirrors `ProjectScene.addHairCard()`'s fixed default rectangle. After placing,
  the new spline is selected (active vertex defaults to `0`) and the tool switches back to `select`.
- Selecting: click-to-select/deselect is a direct copy of `SelectionInteractionHandler`'s shape -
  deselect-on-empty-click falls out for free from `GroomEditor.selectSpline(null, ...)`, no special
  case needed. Also activates a vertex when the click landed on one of its handles (see the Vertex
  gizmo section above), and inserts a vertex instead when the click landed on an already-selected
  spline's own body (see "Adding a vertex" above).
- Dragging a vertex's position: copies `HairCardResizeInteractionHandler`'s grab-offset lifecycle -
  for the first vertex, no offset at all (see the Viewport section's sphere-surface constraint);
  for every other vertex, the offset between the vertex and the screen-facing-plane point under the
  cursor at `MoveStart` is fixed for the whole gesture, so `Move` always re-derives an absolute
  position instead of accumulating drift. `MoveEnd` diffs before/after and pushes one
  `TransformSplineVertexCommand` through history.
- Dragging a vertex's rotate ring/scale handle: same grab-offset shape, against a rotation
  plane/scale axis fixed for the gesture (see the Vertex gizmo section above) - both also commit
  through `TransformSplineVertexCommand`.
- `InteractionContext.intersectCardPlane()` was generalized into `intersectPlane(plane: Plane)`
  (kept as a one-line wrapper) so the groom handlers could reuse the existing plane-raycast helper
  against the ground plane instead of duplicating it. `intersectViewPlane(point)` (screen-facing
  plane through a point) and `intersectAxisPlane(origin, axis)` (plane containing an axis line,
  facing the camera) were added the same way for the vertex gizmo's position/scale drags.

## Commands (`src/editor/groom/main/commands/GroomCommands.ts`)

`AddSplineCommand`, `AddSplineVertexCommand`, `AppendSplineVertexAtCommand`, `InsertSplineVertexCommand`,
`DeleteSplineVertexCommand`, `TransformSplineVertexCommand`, `TransformSplineVerticesCommand`,
`SetSplineOptionsCommand`, `DeleteSplineObjectsCommand` - all follow `SceneCommands.ts`'s exact
snapshot/`apply()` template. `TransformSplineVertexCommand` bundles a vertex's
position/direction/scale into one snapshot, mirroring the object editor's `TransformObjectCommand`,
even though any one gesture only ever changes one of the three fields; `TransformSplineVerticesCommand`
is the plural sibling used by a soft-selection multi-vertex drag (see "Soft selection falloff"
above). `SetSplineOptionsCommand`'s `SplineOptionsSnapshot` now bundles all 6 of a spline's option
fields (`hairCardId`, `resolution`, `cardWidth`, `cardStartOffset`, `smoothModifyEnabled`, `influence`) - two
different panels (`SplineOptionsPanel`/`SplineSmoothModifyPanel`) each edit only a subset of these
per gesture, so both read the fields they don't own live off the model rather than keeping a stale
local mirror before committing.

## React layer

`GroomEditor.tsx`/`GroomToolbar.tsx`/`SplineSmoothModifyPanel.tsx`/`SplinesPanel.tsx`/
`SplineOptionsPanel.tsx`/`GroomStatusBar.tsx`/`AddPointButton.tsx` under `src/editor/groom/components/` mirror the
object editor's equivalents. `WorkspaceHeader.tsx` and `HistoryControls.tsx` were widened to a small
structural `HistoryHost` interface (`src/editor/main/HistoryHost.ts`) instead of the concrete
`Editor` class, so both editors' pages can share them without either editor depending on the other's
class.

`SplineOptionsPanel`'s hair-card picker is populated by `useHairCardOptions.ts`, a plain `fetch`
against the _existing_ `GET /api/projects/[projectId]` route (no new endpoint), filtered to
`type === 'hairCard'`. `SplineSmoothModifyPanel` appears below the toolbar for a single selected
spline and contains only the spline-level Soft selection switch and Influence ratio slider -
see "Soft selection falloff" above. Vertex position/direction/scale remain gizmo-only, while
`GroomToolbar` owns "Add point" and "Delete point" alongside its view-mode `Select`
(wireframe/wireframe-on-shaded/shaded/textured).

## Persistence

Four jsonb/text columns on the existing `projects` table (`src/db/schema.ts`), alongside `scene`/
`thickness` - same row, independent fields: `groom` (`GroomScene.toJSON()`'s output), `bakedMaps`
(`Partial<Record<BakeMapKind, {url: string}>>` - the project's latest baked hair-card texture atlas
maps, written only by `POST /api/projects/[projectId]/hair-cards/bake` merging into the row's
existing value on each bake, never client-settable via `PUT`/`POST /api/projects`), `bakedMapsSceneHash`
(a `HairCardLayoutHash` fingerprint of the hair-card layout that produced `bakedMaps`' current
contents - written by the same bake route, alongside `bakedMaps`, also never client-settable - see
docs/editor/hair-cards-plan.md's "Preview map composer" section), and `previewColors`
(`HairPreviewColors` - HairCardBakeDialog's 4 color pickers, client-settable like `thickness`).
`bakedMaps` exists so the groom editor's "textured"/"preview" view modes keep working after a
reload, not only within the session that produced the bake; `bakedMapsSceneHash` exists so
`GroomHairCardLookup.getBakeStatus` can tell a still-current bake apart from one the cards have
since moved past. `useGroomProjectPersistence.ts` mirrors `useProjectPersistence.ts` but reads/writes
only `{ groom }` for saving; it already fetches the whole row on load and passes it through unedited
to `GroomEditor.loadProject`, which now also reads that same payload's `bakedMaps`/
`bakedMapsSceneHash`/`previewColors` fields into `GroomEditor.hairCardLookup`
(`GroomHairCardLookup.ts`) - the cross-project baked-texture/staleness/color data the 3D runtime
needs (as opposed to `useHairCardOptions.ts`, the React-layer equivalent that only populates
`SplineOptionsPanel`'s dropdown). A card strip's width is never cross-project data - it's the
spline's own `cardWidth` field. The object editor's own `useProjectPersistence` is untouched and
still reads/writes `{ name, scene, thickness, previewColors }` - `previewColors` is that project's
own field, not the groom project's, same as `thickness`. Both `PUT` and `POST /api/projects` accept
an optional `groom` field alongside the existing ones, each independently and shallowly validated
(`Array.isArray`, or `isValidPreviewColors` for `previewColors`) - the same partial-update shape the
route already used for `scene`/`thickness`.

Since this project's DB policy is "wipe and rebuild, no migrations" (see the `mvp` skill), adding
any of these columns requires running `npm run db:push` - not done automatically here.

## Known limitations / explicitly out of scope for this iteration

- The scalp is a bare sphere (`GROOM.SCALP`), not an actual head mesh, and isn't persisted or
  configurable - only its radius (a constant) exists.
- Only one vertex's gizmo is ever shown/editable at a time (`activeVertexIndex`) - there's no way to
  rotate/scale two vertices' handles simultaneously (though "smooth modify" lets one drag propagate
  to neighbors with a falloff, see above).
- No visibility/hide toggle for splines (unlike hair cards' `hiddenIdentifiers`).
- `GroomHairCardLookup`'s cross-project baked-texture data (and the `bakeStatus`/preview colors
  derived from it) is only refreshed on the groom editor's own next load - a fresh bake in another
  tab isn't picked up live, same accepted staleness `useHairCardOptions.ts` already has.
- `viewMode` is ephemeral (`GroomReactBridgeState`, not persisted) - it resets to `'shaded'` on
  reload, unlike the persisted `smoothModifyEnabled`/`influence`/`cardStartOffset`.
- `GroomEditor.serializeProject()` still only returns `{ groom }` - "Save As" doesn't copy `scene`/
  `bakedMaps` into the new project row either (a pre-existing gap, not introduced by the card-strip
  feature).
