import { redirect } from 'next/navigation'

/** The editor requires an actual project - no scratch/unpersisted session. */
export default function EditorPage() {
	redirect('/projects')
}
