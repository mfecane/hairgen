'use client'

import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Toggle } from '@/components/ui/toggle'
import { GROOM } from '@/constants'
import { useGroomReactBridge } from '@/editor/groom/hooks/useGroomReactBridge'
import { GroomEditor } from '@/editor/groom/main/GroomEditor'
import { GroomActiveTool, GroomViewMode } from '@/editor/groom/main/GroomReactBridge'
import { MousePointer2, Minus, Plus, Spline, Trash2 } from 'lucide-react'

interface GroomToolbarProps {
	editor: GroomEditor
}

const TOOLS: ReadonlyArray<{ id: GroomActiveTool; label: string; icon: typeof MousePointer2 }> = [
	{ id: 'select', label: 'Select', icon: MousePointer2 },
	{ id: 'placeSpline', label: 'Place Spline', icon: Spline },
]

const VIEW_MODES: ReadonlyArray<{ id: GroomViewMode; label: string }> = [
	{ id: 'wireframe', label: 'Wireframe' },
	{ id: 'wireframeOnShaded', label: 'Wireframe on shaded' },
	{ id: 'shaded', label: 'Shaded' },
	{ id: 'textured', label: 'Textured' },
]

/** View mode switcher, Select / Place Spline tool switcher, plus add-point/delete-point/delete-selection. Mirrors Toolbar.tsx. */
export function GroomToolbar({ editor }: GroomToolbarProps) {
	const { activeTool, selectedObjectIds, selectedObjectId, activeVertexIndex, viewMode } = useGroomReactBridge()
	const selectedSpline = selectedObjectId ? editor.project.scene.get(selectedObjectId) : null
	const canDeletePoint =
		selectedObjectIds.size === 1 &&
		activeVertexIndex !== null &&
		(selectedSpline?.vertices.length ?? 0) > GROOM.SPLINE.MIN_VERTEX_COUNT

	return (
		<div
			data-id="groom-toolbar"
			className="flex items-center gap-1 rounded-md border border-border bg-background/95 p-1 shadow-sm pointer-events-auto"
		>
			<Select value={viewMode} onValueChange={(value) => editor.setViewMode(value as GroomViewMode)}>
				<SelectTrigger data-id="groom-view-mode-select" className="w-40">
					<SelectValue />
				</SelectTrigger>
				<SelectContent>
					{VIEW_MODES.map(({ id, label }) => (
						<SelectItem key={id} value={id}>
							{label}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
			<div className="ml-1 flex items-center gap-1 border-l border-border pl-1">
				{TOOLS.map(({ id, label, icon: Icon }) => (
					<Toggle
						key={id}
						data-id={`${id}-tool`}
						aria-label={label}
						pressed={activeTool === id}
						onPressedChange={() => editor.setActiveTool(id)}
					>
						<Icon className="size-4" />
					</Toggle>
				))}
			</div>
			{selectedObjectIds.size > 0 && (
				<div
					data-id="groom-toolbar-actions"
					className="ml-1 flex items-center gap-1 border-l border-border pl-1"
				>
					{selectedObjectIds.size === 1 && (
						<Button
							data-id="add-spline-vertex"
							variant="ghost"
							size="icon"
							aria-label="Add point"
							onClick={() => editor.addVertexToSelectedSpline()}
						>
							<Plus className="size-4" />
						</Button>
					)}
					{selectedObjectIds.size === 1 && (
						<Button
							data-id="delete-spline-vertex"
							variant="ghost"
							size="icon"
							aria-label="Delete point"
							disabled={!canDeletePoint}
							onClick={() => editor.deleteActiveSplineVertex()}
						>
							<Minus className="size-4" />
						</Button>
					)}
					<Button
						data-id="delete-selected-spline"
						variant="ghost"
						size="icon"
						aria-label="Delete selected"
						onClick={() => editor.deleteSelected()}
					>
						<Trash2 className="size-4" />
					</Button>
				</div>
			)}
		</div>
	)
}
