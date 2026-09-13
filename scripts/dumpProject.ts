import fs from 'fs'
import path from 'path'

// Load .env.local manually
const envPath = path.join(process.cwd(), '.env.local')
if (fs.existsSync(envPath)) {
	const envContent = fs.readFileSync(envPath, 'utf-8')
	envContent.split('\n').forEach((line) => {
		const trimmed = line.trim()
		if (trimmed && !trimmed.startsWith('#')) {
			const [key, ...valueParts] = trimmed.split('=')
			if (key) {
				process.env[key] = valueParts.join('=')
			}
		}
	})
}

import '@/lib/serverBootstrap'
import { db } from '@/db'
import { projects } from '@/db/schema'
import { eq } from 'drizzle-orm'

async function dumpProject() {
	const projectId = process.argv[2]
	if (!projectId) {
		console.error('Usage: tsx scripts/dumpProject.ts <projectId>')
		process.exit(1)
	}

	try {
		console.log(`Fetching project "${projectId}"...`)
		const project = await db.query.projects.findFirst({
			where: eq(projects.id, projectId),
		})

		if (!project) {
			console.error(`Project with id "${projectId}" not found`)
			process.exit(1)
		}

		const seedDir = path.join(process.cwd(), 'scripts', 'seed', 'projects')
		if (!fs.existsSync(seedDir)) {
			fs.mkdirSync(seedDir, { recursive: true })
		}

		const fileName = `${projectId}.json`
		const filePath = path.join(seedDir, fileName)

		const exported = {
			id: project.id,
			name: project.name,
			scene: project.scene,
		}

		fs.writeFileSync(filePath, JSON.stringify(exported, null, 2))
		console.log(`✓ Project exported to ${filePath}`)
		process.exit(0)
	} catch (error) {
		console.error('Export error:', error)
		process.exit(1)
	}
}

void dumpProject()
