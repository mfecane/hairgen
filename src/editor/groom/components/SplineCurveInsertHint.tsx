'use client'

import { GROOM } from '@/constants'
import { useLiveElementPosition } from '@/editor/hooks/useLiveElementPosition'
import { GroomViewport } from '@/editor/groom/main/GroomViewport'
import { Plus } from 'lucide-react'

interface SplineCurveInsertHintProps {
	viewport: GroomViewport | null
}

/**
 * Floating hint pinned over the viewport at CurveInsertHintAnchor's live screen position (see
 * useLiveElementPosition for why it's synced imperatively, mirroring AddPointButton) - shown while
 * the pointer hovers a selected spline's otherwise-invisible collider tube
 * (GroomViewport.setHoveredCurvePoint, SplineHoverInteractionHandler), at the point along the curve
 * (inferred by parameter t - see SplineBodyGeometry.findClosestPointOnSplineBody) directly under the
 * cursor. Purely a notice that clicking here inserts a new vertex there
 * (SplineSelectionInteractionHandler.insertVertexAtPoint) - unlike AddPointButton it has no click
 * handler of its own and is `pointer-events-none`, so it never intercepts the hover/click it's
 * describing; the collider underneath keeps receiving both. AddPointButton hides itself for the
 * duration (see GroomViewport.render) - showing both "where the next point goes" affordances at once
 * would be confusing.
 *
 * Rendered offset from the anchor point by GROOM.SPLINE.CURSOR_OVERLAY_OFFSET_PX, same as
 * AddPointButton - centered exactly on the cursor's own hover position, this dot would sit directly
 * under the OS pointer icon, which would cover it.
 */
export function SplineCurveInsertHint({ viewport }: SplineCurveInsertHintProps) {
	const hintRef = useLiveElementPosition<HTMLDivElement>(viewport?.subscribeCurveInsertScreenPosition ?? null)

	return (
		<div
			ref={hintRef}
			data-id="groom-curve-insert-hint"
			className="absolute flex size-5 items-center justify-center rounded-full border border-border bg-background/80 text-muted-foreground pointer-events-none"
			style={{
				display: 'none',
				transform: `translate(calc(-50% + ${GROOM.SPLINE.CURSOR_OVERLAY_OFFSET_PX}px), calc(-50% - ${GROOM.SPLINE.CURSOR_OVERLAY_OFFSET_PX}px))`,
			}}
		>
			<Plus className="size-3" />
		</div>
	)
}
