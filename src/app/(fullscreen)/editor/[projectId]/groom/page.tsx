import { GroomEditor } from '@/editor/groom/components/GroomEditor'

export default async function GroomEditorProjectPage({ params }: { params: Promise<{ projectId: string }> }) {
	const { projectId } = await params
	return <GroomEditor projectId={projectId} />
}
