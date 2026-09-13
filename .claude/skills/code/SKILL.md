---
name: code
description: This rule applies to all typescript code, including view models, services, helpers, business logic.
---

# Guidelines

- For new functionality review, where it is put. And consider whether a new service could be implemented for future reuse, ease of management and separation of concerns. Also this prevents context overflow.
- Tend to keep modules, classes, files short. Consider large file size a code smell for potential refactoring.
- Remove dead code, unless it is almost certaily (99%) will be used.
- Follow best practices - SOLID/KISS/YAGNI

# Error handling

- Fail fast, visibly and loud - do not hesitate th throw errors to reveal real problems at runtime.
- Check passed variables for null only null is intended valid value. Otherwise, look for a source of the problem elsewhere.

# Defensive programming

- No defensive programming. No silent fallback values placed without clear reason.

# OOP

Free-standing functions are strictly forbidden. Group related logic by domain into dedicated service classes, register those classes with the DI container, and inject them wherever needed.

Do not group class or function parameters into plain object for convenience.

## DI

Use dependency injection (refer to di skill) for service classes, utility classes, view models, etc.

## Reactivity, events and callbacks

- use callback setter methods, populate callbacks set use AbortControllers to clear callbacks

```typescript
  type CallbackType = <...>
  private readonly callbacks: Set<CallbackType> = new Set()
  public addCallback(callback: CallbackType): AbortController
```

- never create callback constructor parameter
- reactivity between ui layer and business logic layer are set up via clear staightforward callbacks
- Naming could be different callback, listener, handler: addOnUpdateListener, addOnFinishedListener, etc

# Data modelling

- business data of the application is modelled with classes, one class per entity
- make sure collections of business objects are stored into repository classes as source of truth

- no plain objects/arrays used for modelling business data

# Misc

- Do not create meaninglesss arrays, just to "save code lines repetition". Rather extract repeated code and instenciate it n times explicitly. Obvious and clear approach.

# Comments

Keep concise and presise, what/why, no essays - if it needs more than a sentence, rename or refactor the code instead of explaining it. Don't duplicate in a comment what the variable, class or function name already explains. Prefer precise naming over comments.
