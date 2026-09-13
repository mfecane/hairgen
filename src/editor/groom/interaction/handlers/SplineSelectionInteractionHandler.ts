import { CanvasEventType } from '@/editor/interaction/CanvasEventType'
import { InteractionEvent } from '@/editor/interaction/InteractionEvent'
import { InteractionHandler } from '@/editor/interaction/InteractionHandler'
import { InteractionHandlerResult } from '@/editor/interaction/InteractionHandlerResult'
import { tryGetSceneObjectId } from '@/editor/main/SceneObjectRef'
import { GroomViewport } from '@/editor/groom/main/GroomViewport'
import { tryGetSplineVertex } from '@/editor/groom/main/SplineVertexRef'

/** MouseEvent.button value for the primary ("left") button - mirrors SelectionInteractionHandler. */
const SELECT_BUTTON = 0

/**
 * Click-to-select splines, click-empty-to-deselect. Mirrors SelectionInteractionHandler exactly. A
 * click that lands on any vertex handle (position, rotate ring, or scale handle - see
 * tryGetSplineVertex) also activates that vertex's gizmo (SplineVertexGizmo) - the position drag
 * handler's MoveStart does the same for an actual drag gesture, but a plain click (no drag) never
 * dispatches MoveStart, only Click, so activation needs this separate call site too.
 *
 * A plain (non-shift) click on the curve's own body - not a vertex handle - while that spline is
 * already the sole selection instead inserts a new vertex at the clicked point, splitting whichever
 * segment it landed on (GroomEditor.insertVertexAtPoint) - this is "on click, add a point in the
 * middle of the curve." A click on a not-yet-selected spline's body still just selects it first, the
 * same as before, so the gesture never surprises a first click meant only to select.
 */
export class SplineSelectionInteractionHandler implements InteractionHandler {
	public id: string = 'splineSelection'

	public priority: number = 100

	public enabled: boolean = true

	public constructor(private readonly viewport: GroomViewport) {}

	public isEnabled(event: InteractionEvent): boolean {
		return this.enabled && event.type === CanvasEventType.Click && event.context.initiatingButton === SELECT_BUTTON
	}

	public async onEvent(event: InteractionEvent): Promise<InteractionHandlerResult> {
		const object = event.context.hitResult?.object ?? null
		const objectId = object ? tryGetSceneObjectId(object) : null
		const vertexTag = object ? tryGetSplineVertex(object) : null

		if (objectId && !vertexTag && !event.modifiers.shift) {
			const { selectedObjectIds } = this.viewport.editor.reactBridge.getState()
			const point = event.context.hitResult?.intersection?.point ?? null
			if (point && selectedObjectIds.size === 1 && selectedObjectIds.has(objectId)) {
				this.viewport.editor.insertVertexAtPoint(objectId, { x: point.x, y: point.y, z: point.z })
				return new InteractionHandlerResult().setHandled()
			}
		}

		this.viewport.editor.selectSpline(objectId, event.modifiers.shift)
		if (vertexTag) {
			this.viewport.editor.setActiveSplineVertex(vertexTag.vertexIndex)
		}
		return new InteractionHandlerResult().setHandled()
	}
}
