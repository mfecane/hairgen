import { Object3D } from 'three'

/**
 * Tags a viewport's Object3D with the stable SceneObject id it renders, so selection/hit-testing
 * can map a raycast hit (or a tracked group child) back to persisted scene data. Each viewport
 * builds its own Object3D per SceneObject directly from data - unlike the old imported-model tree,
 * there's no shared canonical instance to clone, so a plain userData tag is enough.
 */
export function tagSceneObject(object: Object3D, sceneObjectId: string): void {
	object.userData.sceneObjectId = sceneObjectId
}

export function tryGetSceneObjectId(object: Object3D): string | null {
	const id: unknown = object.userData.sceneObjectId
	return typeof id === 'string' ? id : null
}

/** Same as tryGetSceneObjectId, but throws - for call sites where a missing id is a bug, not a legitimate "no match". */
export function getSceneObjectId(object: Object3D): string {
	const id = tryGetSceneObjectId(object)
	if (!id) {
		throw new Error(`getSceneObjectId: object "${object.name || object.type}" has no scene object id`)
	}
	return id
}
