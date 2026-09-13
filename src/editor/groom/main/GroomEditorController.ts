import { EDITOR_SCENE_COLORS, EditorTheme, GROOM } from '@/constants'
import { CanvasEventHost } from '@/editor/interaction/CanvasEventHandler'
import { InteractionHandler } from '@/editor/interaction/InteractionHandler'
import { HistoryController } from '@/editor/main/HistoryController'
import { GroomActiveTool } from '@/editor/groom/main/GroomReactBridge'
import { AddSplineVertexTool } from '@/editor/groom/tools/AddSplineVertexTool'
import { PlaceSplineTool } from '@/editor/groom/tools/PlaceSplineTool'
import { SplineSelectTool } from '@/editor/groom/tools/SplineSelectTool'
import { SplineVertexDragTool } from '@/editor/groom/tools/SplineVertexDragTool'
import { BakeMapKind } from '@/lib/hair/bake/HairCardBakeTypes'
import { HairCardPreviewMapComposer } from '@/lib/hair/compose/HairCardPreviewMapComposer'
import { HairPreviewColors } from '@/lib/hair/compose/HairCardPreviewMapTypes'
import { DoubleSide, LineBasicMaterial, MeshBasicMaterial, MeshStandardMaterial } from 'three'

type ToolChangeListener = () => void

/**
 * Runtime entry point for the groom editor's tools and shared spline primitives - mirrors
 * EditorController, minus ModeController/EditorMode: the groom editor only ever has one tool-set
 * (select + vertex-drag always active, plus one toggleable Place Spline tool, see
 * ObjectMode's "always-on tool(s) + one exclusive extra tool" shape), so this hosts them directly
 * instead of through a mode-controller indirection.
 */
export class GroomEditorController {
	/** A second, independent undo stack from the object editor's - HistoryController is already domain-agnostic, so it's reused directly rather than duplicated. */
	public readonly history: HistoryController = new HistoryController()

	private readonly selectTool: SplineSelectTool = new SplineSelectTool()

	private readonly vertexDragTool: SplineVertexDragTool = new SplineVertexDragTool()

	private readonly placeSplineTool: PlaceSplineTool = new PlaceSplineTool()

	private readonly addVertexTool: AddSplineVertexTool = new AddSplineVertexTool()

	private activeTool: GroomActiveTool = 'select'

	private readonly listeners: Set<ToolChangeListener> = new Set()

	// Shared across every viewport's spline body (curve) lines, same reasoning as
	// EditorController.cubeGeometry/hairCardGeometry - setTheme recolors every spline everywhere at
	// once. Each spline body owns its own generated geometry (see
	// SplineBodyGeometry.updateSplineBodyGeometry) - only the material is shared.
	public readonly splineLineMaterial: LineBasicMaterial = new LineBasicMaterial({ name: 'splineLineMaterial' })

	// The spline body's collider tube is never drawn - fully transparent, same "invisible pick
	// target" material every handle collider in this editor shares (see SplineVertexWidget's
	// colliderMaterial). One instance shared by every spline's collider, since it never needs its
	// own color.
	public readonly splineColliderMaterial: MeshBasicMaterial = new MeshBasicMaterial({
		name: 'splineColliderMaterial',
		transparent: true,
		opacity: 0,
		depthWrite: false,
	})

	// The card strip's "shaded"/"wireframeOnShaded" material - fixed white, single-color, never
	// carries a texture map (see cardStripPreviewMaterial below for the "Textured"/"Preview" view
	// modes' shared baked-map counterpart). `polygonOffset` pushes its depth back slightly so the
	// coincident curve Line drawn on top of it (see SplineBodyGeometry's renderOrder) never
	// z-fights - the standard three.js technique for a line/wireframe-over-surface pair.
	public readonly cardStripShadedMaterial: MeshStandardMaterial = new MeshStandardMaterial({
		name: 'cardStripShadedMaterial',
		color: 0xffffff,
		side: DoubleSide, // a flat strip is visible from either face, same as HairCard's own quad.
		polygonOffset: true,
		polygonOffsetFactor: 1,
		polygonOffsetUnits: 1,
	})

	// An unselected spline's card strip while another spline is selected - see
	// GroomViewport.render's ghosting rule and GROOM.SPLINE.CARD_STRIP.GHOST_OPACITY.
	public readonly cardStripGhostMaterial: MeshStandardMaterial = new MeshStandardMaterial({
		name: 'cardStripGhostMaterial',
		transparent: true,
		opacity: GROOM.SPLINE.CARD_STRIP.GHOST_OPACITY,
		side: DoubleSide,
		polygonOffset: true,
		polygonOffsetFactor: 1,
		polygonOffsetUnits: 1,
	})

	// The card strip's wireframe overlay - shares its mesh's geometry with cardStripShadedMaterial's
	// mesh (see SplineBodyGeometry), reuses splineBody's theme color rather than a new token.
	public readonly cardStripWireframeMaterial: MeshBasicMaterial = new MeshBasicMaterial({
		name: 'cardStripWireframeMaterial',
		wireframe: true,
	})

	// The card strip's "preview" material - shared by the merged "Textured"/"Preview" view modes (see
	// GroomViewport.applyViewModeAndGhosting; they render identically now, both driven by
	// HairCardPreviewMapComposer's composed map). Same fixed white, not theme-tinted base as
	// cardStripShadedMaterial, plus polygonOffset for the same reason. `map`/`normalMap` are
	// populated lazily by ensureCardStripPreviewMap once either view mode is selected and a bake
	// with `alpha` exists.
	public readonly cardStripPreviewMaterial: MeshStandardMaterial = new MeshStandardMaterial({
		name: 'cardStripPreviewMaterial',
		color: 0xffffff,
		side: DoubleSide,
		transparent: true,
		polygonOffset: true,
		polygonOffsetFactor: 1,
		polygonOffsetUnits: 1,
	})

	private readonly previewMapComposer: HairCardPreviewMapComposer = new HairCardPreviewMapComposer()

	/** Cache key (bake map URLs + colors) last composed onto cardStripPreviewMaterial - see ensureCardStripPreviewMap. */
	private appliedPreviewMapKey: string | null = null

	private theme: EditorTheme = 'dark'

	public constructor() {
		this.selectTool.activate({ controller: this })
		this.vertexDragTool.activate({ controller: this })
	}

	public getInteractionHandlers(host: CanvasEventHost): InteractionHandler[] {
		return [
			...this.selectTool.getInteractionHandlers(host),
			...this.vertexDragTool.getInteractionHandlers(host),
			...(this.activeTool === 'placeSpline' ? this.placeSplineTool.getInteractionHandlers(host) : []),
			...(this.activeTool === 'addVertex' ? this.addVertexTool.getInteractionHandlers(host) : []),
		]
	}

	public setActiveTool(tool: GroomActiveTool): void {
		if (tool === this.activeTool) {
			return
		}
		this.getToggleTool(this.activeTool)?.deactivate()
		this.activeTool = tool
		this.getToggleTool(tool)?.activate({ controller: this })
		this.listeners.forEach((listener) => listener())
	}

	/** The exclusive toggle tool for a given GroomActiveTool value, or null for 'select' (no extra tool). */
	private getToggleTool(tool: GroomActiveTool): PlaceSplineTool | AddSplineVertexTool | null {
		if (tool === 'placeSpline') {
			return this.placeSplineTool
		}
		if (tool === 'addVertex') {
			return this.addVertexTool
		}
		return null
	}

	public addOnToolChangedListener(listener: ToolChangeListener): void {
		this.listeners.add(listener)
	}

	public removeOnToolChangedListener(listener: ToolChangeListener): void {
		this.listeners.delete(listener)
	}

	public setTheme(theme: EditorTheme): void {
		this.theme = theme
		// Matches SplineVertexWidget's position-handle color rather than the neutral splineBody
		// gray - the curve is only ever shown alongside the point manipulators (while a spline's
		// selected), so it reads as "part of the same gizmo" instead of a separate gray guide.
		this.splineLineMaterial.color.setHex(EDITOR_SCENE_COLORS[theme].splineVertexWidget)
		this.cardStripGhostMaterial.color.setHex(EDITOR_SCENE_COLORS[theme].cardStripGhost)
		this.cardStripWireframeMaterial.color.setHex(EDITOR_SCENE_COLORS[theme].splineBody)
	}

	public getTheme(): EditorTheme {
		return this.theme
	}

	/**
	 * Composes cardStripPreviewMaterial's map+normalMap from the project's baked alpha/id/roots/tips/
	 * normal maps and its 4 preview colors (see HairCardPreviewMapComposer.composePreview) -
	 * idempotent, skips recomposing when the same (urls, colors) combination is already applied.
	 * Called every frame while either "Textured" or "Preview" view mode is active, see
	 * GroomViewport.applyViewModeAndGhosting - the two view modes are the same rendering now, both
	 * backed by this one material. A project missing `alpha` (GroomHairCardLookup.getBakeStatus() ===
	 * 'missing') composes nothing here - GroomViewport falls back to the plain shaded material in
	 * that case instead of calling this at all.
	 */
	public ensureCardStripPreviewMap(
		bakedMaps: Partial<Record<BakeMapKind, { url: string }>>,
		colors: HairPreviewColors
	): void {
		const key = JSON.stringify({ maps: bakedMaps, colors })
		if (key === this.appliedPreviewMapKey) {
			return
		}
		this.appliedPreviewMapKey = key
		void this.previewMapComposer.composePreview(bakedMaps, colors).then((result) => {
			// Another call may have already raced ahead with a newer key while this one awaited its
			// texture loads - never let a stale composition clobber it (and dispose the now-unused one).
			if (key !== this.appliedPreviewMapKey) {
				result?.texture.dispose()
				result?.normalMap?.dispose()
				return
			}
			this.cardStripPreviewMaterial.map?.dispose()
			this.cardStripPreviewMaterial.normalMap?.dispose()
			this.cardStripPreviewMaterial.map = result?.texture ?? null
			this.cardStripPreviewMaterial.normalMap = result?.normalMap ?? null
			this.cardStripPreviewMaterial.needsUpdate = true
		})
	}

	public dispose(): void {
		this.splineLineMaterial.dispose()
		this.splineColliderMaterial.dispose()
		this.cardStripShadedMaterial.dispose()
		this.cardStripGhostMaterial.dispose()
		this.cardStripWireframeMaterial.dispose()
		this.cardStripPreviewMaterial.map?.dispose()
		this.cardStripPreviewMaterial.normalMap?.dispose()
		this.cardStripPreviewMaterial.dispose()
		this.previewMapComposer.dispose()
	}
}
