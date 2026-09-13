# DI Container

Lightweight TypeScript DI container with singleton support.

## Usage

There is no global container instance. The server owns one `Container` created in
`@/lib/serverBootstrap` (import `{ container }` from there in server code); the client owns one
created inside `AppContextProvider` (`@/hooks/context/useAppContext`) and read via `useAppContext()`
/ `useEditorContext()` in components.

```typescript
import { Container } from '@/lib/di/container'

const container = new Container()

// Register providers
container.registerSingleton('CONFIG', { useValue: { apiUrl: 'https://api.example.com' } })
container.registerSingleton('DatabaseService', { useClass: DatabaseService })
container.registerSingleton('UserService', {
	useFactory: (c) => new UserService(c.resolve('DatabaseService'))
})

// Resolve instances
const config = container.resolve('CONFIG')
const userService = container.resolve('UserService')
```

## Provider Types

### useValue
```typescript
container.registerSingleton('CONFIG', { useValue: { apiUrl: '...' } })
```

### useClass
```typescript
container.registerSingleton('DatabaseService', { useClass: DatabaseService })
```

### useFactory
```typescript
container.registerSingleton('UserService', {
	useFactory: (c) => new UserService(c.resolve('DatabaseService'))
})
```

## Circular Dependencies

Use `Lazy` (`@/lib/di/Lazy`) to break circular dependencies:

```typescript
import { Lazy } from '@/lib/di/Lazy'

container.registerSingleton('ServiceA', {
	useFactory: (c) => new ServiceA(Lazy.of(c, 'ServiceB'))
})

container.registerSingleton('ServiceB', {
	useFactory: (c) => new ServiceB(Lazy.of(c, 'ServiceA'))
})
```

## API

-   `registerSingleton<T>(token, provider)` - Register singleton
-   `resolve<T>(token)` - Resolve instance (throws on cycles)
-   `Lazy.of<T>(container, token)` / `new Lazy(container, token)` - Deferred resolver, call `.get()` later
-   `reset()` - Clear all (for testing)
