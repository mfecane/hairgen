import { Editor } from '@/editor/main/Editor'

let editor: Editor | null = null

export function getEditorSession(): Editor {
	if (!editor) {
		editor = new Editor()
	}
	return editor
}
