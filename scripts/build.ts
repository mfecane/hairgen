import { execSync } from 'child_process'

const env = process.env.VERCEL_ENV

console.log('Build env:', env)

try {
	execSync('npm run db:push', { stdio: 'inherit' })
} catch (error) {
	console.error('[build] db:push failed')
	throw error
}

try {
	execSync('next build', { stdio: 'inherit' })
} catch (error) {
	console.error('[build] Next build failed')
	throw error
}
