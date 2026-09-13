import { db } from '@/db'
import { projects } from '@/db/schema'
import { SceneObjectData } from '@/editor/main/Project'
import { ADMIN_EMAIL } from './adminUser'
import demoProject from './projects/demo-project.json'

const DEMO_PROJECT_ID = 'demo-project'

/** Scene fixture - see scripts/seed/projects/demo-project.json (its own `id`/`name` fields are ignored; the row's are DEMO_PROJECT_ID/below). */
const DEMO_SCENE = demoProject.scene as SceneObjectData[]

/** Seeds one demo project (loaded from projects/demo-project.json) owned by the admin user, so a fresh environment has something to open. */
export async function seedProjects(): Promise<void> {
	const adminUser = await db.query.users.findFirst({
		where: (users, { eq }) => eq(users.email, ADMIN_EMAIL),
	})
	if (!adminUser) {
		throw new Error('seedProjects: admin user not found. Run adminUser seed first.')
	}

	await db
		.insert(projects)
		.values({
			id: DEMO_PROJECT_ID,
			userId: adminUser.id,
			name: 'Demo project',
			scene: DEMO_SCENE,
		})
		.onConflictDoUpdate({
			target: projects.id,
			set: { scene: DEMO_SCENE },
		})

	console.log('✓ Demo project seeded')
}
