import { HAIR_CARD } from '@/constants'
import { SceneObjectData } from '@/editor/main/Project'
import { HairCardStrandsGenerator } from '@/lib/hair/HairCardStrandsGenerator'
import { BufferGeometry } from 'three'

type Listener = () => void

/**
 * Owns every hair card's generated strand geometry (see HairCardStrandsGenerator), keyed by card
 * id, shared across every Viewport the same way EditorController.hairCardGeometry is - each viewport
 * just mirrors this map into its own Mesh per card (see Viewport's hairCardStrand meshes), pointing
 * at the same BufferGeometry instance. Geometry is built in the card's own local space (root at the
 * card's center), so a card's position never needs to touch this cache - only width/depth/
 * rootSpread/coverage do.
 *
 * regenerate() is immediate - a discrete, one-shot action (add, load, undo/redo) deserves to show
 * up right away. scheduleRegenerate() debounces per card id (HAIR_CARD.STRANDS_REGENERATE_DEBOUNCE_MS)
 * for edits that settle after a moment - a resize/move drag's MoveEnd, a settings-slider commit -
 * so rapid successive edits collapse into the one rebuild after things stop changing. remove() is
 * how a drag hides a card's mesh the instant it starts (see
 * HairCardMoveInteractionHandler/HairCardResizeInteractionHandler) - it also cancels any pending
 * scheduleRegenerate for that id, so a stale debounce can't resurrect it mid-drag.
 */
export class HairCardStrandsController {
	private readonly geometriesById = new Map<string, BufferGeometry>()

	private readonly pendingTimeouts = new Map<string, ReturnType<typeof setTimeout>>()

	private readonly listeners: Set<Listener> = new Set()

	private readonly generator: HairCardStrandsGenerator = new HairCardStrandsGenerator()

	public subscribe(listener: Listener): AbortController {
		this.listeners.add(listener)
		const controller = new AbortController()
		controller.signal.addEventListener('abort', () => this.listeners.delete(listener))
		return controller
	}

	public getEntries(): ReadonlyMap<string, BufferGeometry> {
		return this.geometriesById
	}

	/** One card's current merged strand geometry, if it has one - see HairCardBaker.bake, which reads it fresh each bake rather than caching it. */
	public getGeometry(cardId: string): BufferGeometry | undefined {
		return this.geometriesById.get(cardId)
	}

	/** Builds and caches one card's strand geometry immediately, replacing and disposing any previous one. `thickness` is the global setting (see Project.thickness) - not part of the card itself. */
	public regenerate(card: SceneObjectData, thickness: number): void {
		this.clearPending(card.id)
		const next = this.generator.generate({
			width: card.width,
			depth: card.depth,
			rootSpread: card.rootSpread,
			coverage: card.coverage,
			thickness,
			heightVariance: card.heightVariance,
			cutVariance: card.cutVariance,
			modifiers: card.modifiers,
			seed: card.id,
		})
		const previous = this.geometriesById.get(card.id)
		if (next) {
			this.geometriesById.set(card.id, next)
		} else {
			this.geometriesById.delete(card.id)
		}
		previous?.dispose()
		this.emit()
	}

	/** Same as regenerate(), debounced per card id - see the class doc. */
	public scheduleRegenerate(card: SceneObjectData, thickness: number): void {
		this.clearPending(card.id)
		const timeout = setTimeout(() => {
			this.pendingTimeouts.delete(card.id)
			this.regenerate(card, thickness)
		}, HAIR_CARD.STRANDS_REGENERATE_DEBOUNCE_MS)
		this.pendingTimeouts.set(card.id, timeout)
	}

	/** Hides one card's strand mesh immediately (see the class doc) - cancels any pending regenerate too. */
	public remove(cardId: string): void {
		this.clearPending(cardId)
		const geometry = this.geometriesById.get(cardId)
		if (!geometry) {
			return
		}
		geometry.dispose()
		this.geometriesById.delete(cardId)
		this.emit()
	}

	/** Drops every cached geometry whose id isn't in `currentIds` - called after every command commits, so a deleted card (or an undone add) can't leave a stale mesh behind. */
	public removeStale(currentIds: ReadonlySet<string>): void {
		;[...this.geometriesById.keys()].filter((id) => !currentIds.has(id)).forEach((id) => this.remove(id))
	}

	public dispose(): void {
		this.pendingTimeouts.forEach((timeout) => clearTimeout(timeout))
		this.pendingTimeouts.clear()
		this.geometriesById.forEach((geometry) => geometry.dispose())
		this.geometriesById.clear()
		this.listeners.clear()
	}

	private clearPending(cardId: string): void {
		const timeout = this.pendingTimeouts.get(cardId)
		if (timeout !== undefined) {
			clearTimeout(timeout)
			this.pendingTimeouts.delete(cardId)
		}
	}

	private emit(): void {
		this.listeners.forEach((listener) => listener())
	}
}
