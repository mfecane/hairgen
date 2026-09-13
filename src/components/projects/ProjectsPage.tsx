'use client'

import { Header } from '@/components/layout/Header'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Loader } from '@/components/ui/loader'
import { Plus } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

interface ProjectSummary {
	id: string
	name: string
	updatedAt: string
}

export function ProjectsPage() {
	const router = useRouter()
	const [projects, setProjects] = useState<ProjectSummary[] | null>(null)
	const [error, setError] = useState<string | null>(null)
	const [creating, setCreating] = useState(false)

	useEffect(() => {
		fetch('/api/projects')
			.then(async (response) => {
				if (!response.ok) {
					throw new Error(`ProjectsPage: failed to load projects (${response.status})`)
				}
				const { projects } = await response.json()
				setProjects(projects)
			})
			.catch((cause: unknown) => setError(cause instanceof Error ? cause.message : String(cause)))
	}, [])

	async function createProject(): Promise<void> {
		setCreating(true)
		try {
			const response = await fetch('/api/projects', { method: 'POST' })
			if (!response.ok) {
				throw new Error(`ProjectsPage: failed to create project (${response.status})`)
			}
			const { project } = await response.json()
			router.push(`/editor/${project.id}`)
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : String(cause))
			setCreating(false)
		}
	}

	return (
		<div data-id="projects-page" className="min-h-screen">
			<Header />
			<main className="mx-auto max-w-3xl px-6 py-8">
				<div className="mb-6 flex items-center justify-between">
					<h1 className="text-2xl font-semibold text-foreground">Your projects</h1>
					<Button data-id="new-project" onClick={() => void createProject()} disabled={creating}>
						<Plus /> New project
					</Button>
				</div>

				{error && <p className="text-sm text-destructive">{error}</p>}

				{!projects && !error && (
					<div className="flex justify-center py-16">
						<Loader />
					</div>
				)}

				{projects && projects.length === 0 && (
					<p data-id="no-projects" className="text-sm text-muted-foreground">
						You have no projects yet. Create one to open the editor.
					</p>
				)}

				{projects && projects.length > 0 && (
					<div data-id="project-list" className="flex flex-col gap-3">
						{projects.map((project) => (
							<Card
								key={project.id}
								data-id={`project-card-${project.id}`}
								role="button"
								tabIndex={0}
								className="cursor-pointer transition-colors hover:border-ring"
								onClick={() => router.push(`/editor/${project.id}`)}
								onKeyDown={(event) => {
									if (event.key !== 'Enter' && event.key !== ' ') {
										return
									}
									event.preventDefault()
									router.push(`/editor/${project.id}`)
								}}
							>
								<CardHeader>
									<CardTitle className="text-base">{project.name}</CardTitle>
									<CardDescription>Last edited {new Date(project.updatedAt).toLocaleString()}</CardDescription>
								</CardHeader>
							</Card>
						))}
					</div>
				)}
			</main>
		</div>
	)
}
