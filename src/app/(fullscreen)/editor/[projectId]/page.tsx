import { Editor } from '@/editor/components/Editor'

export default async function EditorProjectPage({ params }: { params: Promise<{ projectId: string }> }) {
	const { projectId } = await params
	return <Editor projectId={projectId} />
}
