# Editor architecture

This is a bare-minimum 3D editor shell, kept intentionally small to exercise the reusable editor
skeleton rather than any particular modeling feature - see the `editor-architecture` skill for the
general ownership model (Editor / EditorController / HistoryController / Commands / Tools /
ReactBridge / the interaction-handler pipeline).

`EditorController.history` owns a linear command history. Every mutation of the editor's
source-of-truth state (`Project.scene`) goes through an `EditorCommand` (see
`commands/SceneCommands.ts`): `AddCubeCommand`, `DeleteObjectsCommand`, and
`TransformObjectCommand`. Undo and redo are available from the workspace header and through
Cmd/Ctrl+Z and Cmd/Ctrl+Shift+Z. Loading a persisted project establishes a new history baseline
rather than becoming an undoable edit.

`Project.scene` (`ProjectScene`) is the editor's source of truth: a flat set of `SceneObject`s
(today, only `type: 'cube'`), each with its own position/rotation/scale. It has no reference to any
Three.js object. Each `Viewport` builds and reconciles its own cube meshes directly from this data
(`Viewport.syncSceneObjects`) - nothing 3D is shared between viewports.

`ObjectMode` (the editor's only `EditorMode`) always hosts `SelectTool` - click-to-select works no
matter what else is active - plus, on top of it, at most one of `TranslateTool`/`RotateTool`/
`ScaleTool`, switched by the toolbar via `Editor.setActiveTool`/`ObjectMode.setActiveTool`. All four
are genuine `Tool` implementations following the identical shape: each contributes one
`InteractionHandler` to the `InteractionHandlerRouter` pipeline. `SelectionInteractionHandler`
handles clicks; `TranslateInteractionHandler`/`RotateInteractionHandler`/`ScaleInteractionHandler`
(sharing a common base, `DragManipulationHandler`) handle drags on the selected object - each
captures the router for the duration of one drag gesture (see `InteractionHandlerResult.setCapture`),
applies its own delta live, and commits one undoable `TransformObjectCommand` (before/after
snapshot) on release. Because the drag is captured, `OrbitInteractionHandler` simply never runs
mid-drag - no extra coordination needed.

Each 3D viewport includes Three.js `ViewHelper` in its lower-right corner. Click an axis to animate
the camera to that orientation around the current orbit target. Selecting an object shows
`SelectionWidget` in `Viewport.overlayScene`: corner brackets around the selection's world-space
bounding box.
