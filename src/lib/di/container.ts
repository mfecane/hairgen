/**
 * Lightweight TypeScript DI container with singleton support.
 * No decorators, no reflect-metadata, no proxies.
 */

export type Token<T = unknown> = string | symbol | (new (...args: never[]) => T)

export interface UseClassProvider<T> {
	useClass: new (...args: never[]) => T
}

export interface UseFactoryProvider<T> {
	useFactory: (container: Container) => T
}

export interface UseValueProvider<T> {
	useValue: T
}

export type Provider<T = unknown> = UseClassProvider<T> | UseFactoryProvider<T> | UseValueProvider<T>

export class CircularDependencyError extends Error {
	constructor(public readonly cycle: Token[]) {
		super(`Circular dependency detected: ${cycle.map((t) => String(t)).join(' → ')}`)
		this.name = 'CircularDependencyError'
	}
}

export class Container {
	private readonly registrations = new Map<Token, Provider>()
	private readonly instances = new Map<Token, unknown>()
	private readonly resolving = new Set<Token>()
	private readonly resolutionPath: Token[] = []

	/**
	 * Register a singleton provider for a token.
	 */
	registerSingleton<T>(token: Token<T>, provider: Provider<T>): void {
		this.registrations.set(token, provider)
	}

	/**
	 * Resolve an instance for a token. Returns the same instance every time (singleton).
	 * Throws CircularDependencyError if a cycle is detected.
	 */
	resolve<T>(token: Token<T>): T {
		// Check if already resolved (singleton)
		if (this.instances.has(token)) {
			return this.instances.get(token) as T
		}

		// Detect circular dependencies
		if (this.resolving.has(token)) {
			const cycleStart = this.resolutionPath.indexOf(token)
			const cycle = [...this.resolutionPath.slice(cycleStart), token]
			throw new CircularDependencyError(cycle)
		}

		// Get provider
		const provider = this.registrations.get(token) as Provider<T> | undefined
		if (!provider) {
			throw new Error(`No provider registered for token: ${String(token)}`)
		}

		// Mark as resolving and track path
		this.resolving.add(token)
		this.resolutionPath.push(token)

		try {
			// Resolve instance based on provider type
			let instance: T

			if ('useValue' in provider) {
				instance = (provider as UseValueProvider<T>).useValue
			} else if ('useFactory' in provider) {
				instance = (provider as UseFactoryProvider<T>).useFactory(this)
			} else if ('useClass' in provider) {
				instance = new (provider as UseClassProvider<T>).useClass()
			} else {
				throw new Error(
					`Invalid provider for token: ${String(token)}. Must have useValue, useFactory, or useClass.`
				)
			}

			// Store as singleton
			this.instances.set(token, instance)
			return instance
		} finally {
			// Clean up resolution tracking
			this.resolving.delete(token)
			this.resolutionPath.pop()
		}
	}

	/**
	 * Check if a token is registered.
	 */
	isRegistered(token: Token): boolean {
		return this.registrations.has(token)
	}

	/**
	 * Check if a token has been resolved (instance exists).
	 */
	isResolved(token: Token): boolean {
		return this.instances.has(token)
	}

	/**
	 * Reset the container (clears all registrations and instances).
	 * Useful for testing.
	 */
	reset(): void {
		this.registrations.clear()
		this.instances.clear()
		this.resolving.clear()
		this.resolutionPath.length = 0
	}
}
