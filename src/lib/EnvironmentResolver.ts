import { EnvironmentType } from '@/lib/EnvironmentType'

export class EnvironmentResolver {
	public getEnvironmentKey(): EnvironmentType {
		const vercelEnv = process.env.NEXT_PUBLIC_VERCEL_ENV || process.env.VERCEL_ENV
		if (vercelEnv === 'preview') {
			return EnvironmentType.Preview
		}
		if (vercelEnv === 'production') {
			return EnvironmentType.Production
		}
		return EnvironmentType.Local
	}
}
