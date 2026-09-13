import { auth } from '@/lib/auth/auth-server'
import { ProjectsPage } from '@/components/projects/ProjectsPage'
import { redirect } from 'next/navigation'

export default async function ProjectsRoute() {
	const session = await auth()
	if (!session?.user) {
		redirect('/auth/gate')
	}
	return <ProjectsPage />
}
