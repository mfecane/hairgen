import { EditorCommand } from '@/editor/main/EditorCommand'
import { ProjectScene, SceneObject, SceneObjectData } from '@/editor/main/Project'
import { HairCardModifier, HairCardModifierFactory, HairCardModifierType } from '@/lib/hair/modifiers/HairCardModifier'

export class AddHairCardCommand implements EditorCommand {
	private data: SceneObjectData | null = null

	public constructor(private readonly scene: ProjectScene) {}

	public execute(): void {
		if (this.data) {
			this.scene.restore(this.data)
			return
		}
		this.data = this.scene.addHairCard().toJSON()
	}

	public undo(): void {
		if (!this.data) {
			throw new Error('AddHairCardCommand.undo: command has not been executed')
		}
		this.scene.remove(this.data.id)
	}

	public affectsProject(): boolean {
		return true
	}

	public getObjectId(): string {
		if (!this.data) {
			throw new Error('AddHairCardCommand.getObjectId: command has not been executed')
		}
		return this.data.id
	}
}

export class DeleteObjectsCommand implements EditorCommand {
	private items: readonly SceneObjectData[] | null = null

	public constructor(
		private readonly scene: ProjectScene,
		private readonly objectIds: readonly string[]
	) {}

	public execute(): void {
		if (!this.items) {
			this.items = this.objectIds.map((objectId) => {
				const object = this.scene.get(objectId)
				if (!object) {
					throw new Error(`DeleteObjectsCommand.execute: object "${objectId}" does not exist`)
				}
				return object.toJSON()
			})
		}
		this.objectIds.forEach((objectId) => this.scene.remove(objectId))
	}

	public undo(): void {
		if (!this.items) {
			throw new Error('DeleteObjectsCommand.undo: command has not been executed')
		}
		this.items.forEach((item) => this.scene.restore(item))
	}

	public affectsProject(): boolean {
		return true
	}
}

export interface HairCardMoveSnapshot {
	x: number
	y: number
}

/** One completed drag of a hair card's body - see HairCardMoveInteractionHandler. Cards are z = 0 and never rotate, so only x/y move. */
export class MoveHairCardCommand implements EditorCommand {
	public constructor(
		private readonly scene: ProjectScene,
		private readonly objectId: string,
		private readonly before: HairCardMoveSnapshot,
		private readonly after: HairCardMoveSnapshot
	) {}

	public execute(): void {
		this.apply(this.after)
	}

	public undo(): void {
		this.apply(this.before)
	}

	public affectsProject(): boolean {
		return true
	}

	private apply(snapshot: HairCardMoveSnapshot): void {
		const object = this.scene.get(this.objectId)
		if (!object) {
			throw new Error(`MoveHairCardCommand: no object "${this.objectId}"`)
		}
		object.position = { x: snapshot.x, y: snapshot.y, z: 0 }
	}
}

export interface HairCardResizeSnapshot {
	x: number
	y: number
	width: number
	depth: number
}

/** One completed drag of a hair card's corner handle - see HairCardResizeInteractionHandler. Resizing about the fixed opposite corner moves the center too, so position is part of the snapshot. */
export class ResizeHairCardCommand implements EditorCommand {
	public constructor(
		private readonly scene: ProjectScene,
		private readonly objectId: string,
		private readonly before: HairCardResizeSnapshot,
		private readonly after: HairCardResizeSnapshot
	) {}

	public execute(): void {
		this.apply(this.after)
	}

	public undo(): void {
		this.apply(this.before)
	}

	public affectsProject(): boolean {
		return true
	}

	private apply(snapshot: HairCardResizeSnapshot): void {
		const object = this.scene.get(this.objectId)
		if (!object) {
			throw new Error(`ResizeHairCardCommand: no object "${this.objectId}"`)
		}
		object.position = { x: snapshot.x, y: snapshot.y, z: 0 }
		object.width = snapshot.width
		object.depth = snapshot.depth
	}
}

export interface HairCardStrandSettingsSnapshot {
	rootSpread: number
	coverage: number
	heightVariance: number
	cutVariance: number
}

/** One committed edit of a hair card's strand settings - see HairCardOptionsPanel/Editor.commitHairCardStrandSettings. */
export class SetHairCardStrandSettingsCommand implements EditorCommand {
	public constructor(
		private readonly scene: ProjectScene,
		private readonly objectId: string,
		private readonly before: HairCardStrandSettingsSnapshot,
		private readonly after: HairCardStrandSettingsSnapshot
	) {}

	public execute(): void {
		this.apply(this.after)
	}

	public undo(): void {
		this.apply(this.before)
	}

	public affectsProject(): boolean {
		return true
	}

	private apply(snapshot: HairCardStrandSettingsSnapshot): void {
		const object = this.scene.get(this.objectId)
		if (!object) {
			throw new Error(`SetHairCardStrandSettingsCommand: no object "${this.objectId}"`)
		}
		object.rootSpread = snapshot.rootSpread
		object.coverage = snapshot.coverage
		object.heightVariance = snapshot.heightVariance
		object.cutVariance = snapshot.cutVariance
	}
}

/** One added modifier - see HairCardModifierStackPanel's "add modifier" menu. */
export class AddHairCardModifierCommand implements EditorCommand {
	private readonly factory = new HairCardModifierFactory()

	private modifier: HairCardModifier | null = null

	public constructor(
		private readonly scene: ProjectScene,
		private readonly cardId: string,
		private readonly type: HairCardModifierType
	) {}

	public execute(): void {
		const card = this.getCard()
		this.modifier ??= this.factory.create(this.type)
		card.modifiers = [...card.modifiers, this.modifier]
	}

	public undo(): void {
		if (!this.modifier) {
			throw new Error('AddHairCardModifierCommand.undo: command has not been executed')
		}
		const addedId = this.modifier.id
		const card = this.getCard()
		card.modifiers = card.modifiers.filter((modifier) => modifier.id !== addedId)
	}

	public affectsProject(): boolean {
		return true
	}

	public getModifierId(): string {
		if (!this.modifier) {
			throw new Error('AddHairCardModifierCommand.getModifierId: command has not been executed')
		}
		return this.modifier.id
	}

	private getCard(): SceneObject {
		const card = this.scene.get(this.cardId)
		if (!card || card.type !== 'hairCard') {
			throw new Error(`AddHairCardModifierCommand: no hair card "${this.cardId}"`)
		}
		return card
	}
}

/** One removed modifier - restores it at its original index on undo. */
export class RemoveHairCardModifierCommand implements EditorCommand {
	private removed: { modifier: HairCardModifier; index: number } | null = null

	public constructor(
		private readonly scene: ProjectScene,
		private readonly cardId: string,
		private readonly modifierId: string
	) {}

	public execute(): void {
		const card = this.getCard()
		if (!this.removed) {
			const index = card.modifiers.findIndex((modifier) => modifier.id === this.modifierId)
			if (index === -1) {
				throw new Error(`RemoveHairCardModifierCommand: no modifier "${this.modifierId}"`)
			}
			this.removed = { modifier: card.modifiers[index], index }
		}
		card.modifiers = card.modifiers.filter((modifier) => modifier.id !== this.modifierId)
	}

	public undo(): void {
		if (!this.removed) {
			throw new Error('RemoveHairCardModifierCommand.undo: command has not been executed')
		}
		const card = this.getCard()
		const modifiers = [...card.modifiers]
		modifiers.splice(this.removed.index, 0, this.removed.modifier)
		card.modifiers = modifiers
	}

	public affectsProject(): boolean {
		return true
	}

	private getCard(): SceneObject {
		const card = this.scene.get(this.cardId)
		if (!card || card.type !== 'hairCard') {
			throw new Error(`RemoveHairCardModifierCommand: no hair card "${this.cardId}"`)
		}
		return card
	}
}

/** One completed drag-and-drop reorder of a hair card's modifier stack - see HairCardModifierStackPanel. */
export class ReorderHairCardModifierCommand implements EditorCommand {
	public constructor(
		private readonly scene: ProjectScene,
		private readonly cardId: string,
		private readonly beforeOrder: readonly string[],
		private readonly afterOrder: readonly string[]
	) {}

	public execute(): void {
		this.apply(this.afterOrder)
	}

	public undo(): void {
		this.apply(this.beforeOrder)
	}

	public affectsProject(): boolean {
		return true
	}

	private apply(order: readonly string[]): void {
		const card = this.scene.get(this.cardId)
		if (!card || card.type !== 'hairCard') {
			throw new Error(`ReorderHairCardModifierCommand: no hair card "${this.cardId}"`)
		}
		const byId = new Map(card.modifiers.map((modifier) => [modifier.id, modifier]))
		card.modifiers = order.map((id) => {
			const modifier = byId.get(id)
			if (!modifier) {
				throw new Error(`ReorderHairCardModifierCommand: no modifier "${id}"`)
			}
			return modifier
		})
	}
}

/** One committed edit of a single modifier - covers both its enabled toggle and a params edit (whole-modifier snapshot). */
export class SetHairCardModifierCommand implements EditorCommand {
	public constructor(
		private readonly scene: ProjectScene,
		private readonly cardId: string,
		private readonly before: HairCardModifier,
		private readonly after: HairCardModifier
	) {}

	public execute(): void {
		this.apply(this.after)
	}

	public undo(): void {
		this.apply(this.before)
	}

	public affectsProject(): boolean {
		return true
	}

	private apply(snapshot: HairCardModifier): void {
		const card = this.scene.get(this.cardId)
		if (!card || card.type !== 'hairCard') {
			throw new Error(`SetHairCardModifierCommand: no hair card "${this.cardId}"`)
		}
		card.modifiers = card.modifiers.map((modifier) => (modifier.id === snapshot.id ? snapshot : modifier))
	}
}
