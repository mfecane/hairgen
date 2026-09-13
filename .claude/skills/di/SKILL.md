---
name: di
description: Use when registering services, adding new injectable dependencies, or consuming the DI container on frontend, backend, or editor code.
---

# Dependency injection

## Container

- `Container` (`src/lib/di/container.ts`) is a minimal singleton-only container: `registerSingleton(token, provider)` + `resolve(token)`. Providers: `useValue`, `useClass`, `useFactory`. Cycle detection throws `CircularDependencyError`.
- `Lazy` (`src/lib/di/Lazy.ts`) breaks circular deps: `Lazy.of(container, token)` inside a `useFactory`, resolve later via `.get()`.
- There is no global container instance. Never do `new Container()` for real code paths.

## The three scopes

- Server: single instance owned by `src/lib/serverBootstrap.ts`, exported as `container`. Registered by `registerServices` (`src/di/registerServices.ts`).
- Client (app): single instance owned by `AppContextProvider` (`src/hooks/context/useAppContext.tsx`), created once via `useState(() => new Container())`. Registered by `registerClientServices` (`src/di/registerClient.ts`).
- Editor: not a separate instance — `registerEditorServices` (`src/editor/services/registerEditorServices.ts`) registers editor-only services into the client container, called once from `Editor.tsx` on mount.

Server and client registration share the same `ServiceAlias` const enum (`src/di/ServiceAlias.ts`) but are separate lists. Client registration is a deliberate subset: it must never register anything doing real I/O with server-only credentials (e.g. `StorageClient` is server-only; `StorageKeyFactory`/`*UrlResolver` which only build URLs are shared).

Editor tokens live in their own enum, `EditorServiceAlias` (`src/editor/main/EditorServiceAlias.ts`), namespaced separately from app-level `ServiceAlias`.

## Consuming it

- Backend: `import { container } from '@/lib/serverBootstrap'`, then `container.resolve<T>(ServiceAlias.X)` inline at the point of use (e.g. inside a route handler body).
- Frontend (React): `const { container } = useAppContext()`, then `container.resolve<T>(ServiceAlias.X)` inline in the component body. Resolving is cheap (singleton lookup), so resolve at use, don't thread instances through props.
- Editor (non-React classes): the `Container` is passed explicitly through constructors (`EditorFactory`, `Editor`, `EditorController`) since these objects live outside the component tree and have no hook access.

## What belongs in DI

- Anything with constructor dependencies on other services.
- Anything whose concrete implementation is chosen by environment (e.g. `StorageClientFactory` branches on env inside the factory to build the right client).
- Anything server, client, and/or editor need to resolve by the same token/contract.

## What does not belong in DI

- React local/UI state.
- Framework-level singletons already imported as plain modules (`db`, `auth()`).
- Pure stateless utility functions with no dependencies.

## Adding a new service

1. Add a token to `ServiceAlias` (or `EditorServiceAlias` if editor-only).
2. Register it in `registerServices` (server) and, if the client/editor legitimately needs it, also in `registerClientServices` / `registerEditorServices`. Do not register server-only I/O clients on the client.
3. Prefer `useFactory` when the service has dependencies — resolve them via `c.resolve(...)` inside the factory, don't reach for module-level singletons.
4. If two services need each other, use `Lazy.of` on one side rather than restructuring around the cycle.
