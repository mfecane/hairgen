import { CanvasEventType } from '@/editor/interaction/CanvasEventType'
import { InteractionEvent } from '@/editor/interaction/InteractionEvent'
import { InteractionHandler } from '@/editor/interaction/InteractionHandler'
import { InteractionHandlerResult } from '@/editor/interaction/InteractionHandlerResult'
import { tryGetSceneObjectId } from '@/editor/main/SceneObjectRef'
import { GroomViewport } from '@/editor/groom/main/GroomViewport'
import { tryGetSplineVertex } from '@/editor/groom/main/SplineVertexRef'

/**
 * Tracks which vertex handle (position/rotate/scale - see SplineVertexRef) the pointer currently
 * sits over, purely so SplineVertexWidget/SplineVertexGizmo can swap that one handle's material to
 * GROOM.SPLINE.HANDLE_HOVER_COLOR (see GroomViewport.render, which feeds the result back into both
 * widgets' update() every frame). Never claims the event - hovering is a passive readout that every
 * other handler (drag/rotate/scale/select) still needs to see.
 *
 * Also tracks hovering a selected spline's own body - not a vertex handle, its (otherwise invisible)
 * collider tube - and feeds the hit point to GroomViewport.setHoveredCurvePoint, which snaps it onto
 * the curve for CurveInsertHintAnchor/SplineCurveInsertHint.tsx's "clicking here inserts a point"
 * hint. A spline's collider is only pickable while it's the sole selection (getPickableBodyCollider),
 * the exact same guard SplineSelectionInteractionHandler.insertVertexAtPoint uses - so a scene-object
 * hit here that isn't a vertex handle always means "hovering the insert-a-point gesture's target,"
 * never an unselected spline's card strip (which is pickable instead, but only for re-selecting it).
 */
export class SplineHoverInteractionHandler implements InteractionHandler {
	public id: string = 'splineHover'

	public priority: number = 10

	public enabled: boolean = true

	public constructor(private readonly viewport: GroomViewport) {}

	public isEnabled(event: InteractionEvent): boolean {
		return this.enabled && event.type === CanvasEventType.Hover
	}

	public async onEvent(event: InteractionEvent): Promise<InteractionHandlerResult> {
		const object = event.context.hitResult?.object ?? null
		const vertexTag = object ? tryGetSplineVertex(object) : null
		this.viewport.setHoveredHandle(vertexTag)

		const splineId = !vertexTag && object ? tryGetSceneObjectId(object) : null
		const point = event.context.hitResult?.intersection?.point ?? null
		this.viewport.setHoveredCurvePoint(splineId, point)
		return new InteractionHandlerResult().setPass()
	}
}
