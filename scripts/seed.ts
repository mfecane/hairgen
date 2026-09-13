import '@/lib/serverBootstrap'
import { addAdminUser } from './seed/adminUser'
import { ensureSchema } from './seed/ensureSchema'
import { seedProjects } from './seed/projects'

async function seed() {
	try {
		console.log('Seeding PostgreSQL database...')
		await ensureSchema()
		await addAdminUser()
		await seedProjects()
		console.log('=== Seeding completed ===')
		process.exit(0)
	} catch (error) {
		console.error('Seeding error:', error)
		process.exit(1)
	}
}

void seed()
