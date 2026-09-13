import { GroomEditor } from '@/editor/groom/main/GroomEditor'

let groomEditor: GroomEditor | null = null

/** The process-wide (module-scope) single GroomEditor instance - mirrors EditorSession.ts. A separate singleton from getEditorSession()'s Editor, per the groom editor's "full separation" decision. */
export function getGroomEditorSession(): GroomEditor {
	if (!groomEditor) {
		groomEditor = new GroomEditor()
	}
	return groomEditor
}
