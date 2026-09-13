---
name: code-quality
description: Use before writing, reviewing, or refactoring code — architecture, naming, error handling, review standards. Triggers: write/refactor/review/clean up code, add files, restructure.
---

# Guidelines

- Fail fast and visibly - do not hesitate th throw errors to reveal real problems at runtime.
- Check passed variables for null only null is intended valid value. Otherwise, look for a source of the problem elsewhere.
- No defensive programming. No silent fallback values placed without clear reason.
- For new functionality review, where it is put. And consider whether a new service could be implemented for future reuse, ease of management and separation of concerns. Also this prevents context overflow.
- Tend to keep modules, classes, files short. Consider large file size a code smell for potential refactoring.
- Remove dead code, unless it is almost certaily (99%) will be used.
- Follow best practices - SOLID/KISS/YAGNI

# Classes

- Never create callback constructor parameter, use straightforward addCallback pattern, described below
- Do not group class or function parameters into plain object for convenience. Use only class, and only if it has meaning behiund it.

# Data modelling

- business data of the application is modelled with classes, one class per entity
- make sure collections of business objects are stored into repository classes as source of truth
- Make sure that reactivity between ui layer and business logic layer are set up via clear staightforward callbacks setup. No callbacks passed to constructor.
    - Naming could be different: addOnUpdateListener, addOnFinishedListener, etc

```
  type CallbackType = <...>

  private readonly callbacks: Set<CallbackType> = new Set()

  public addCallback(callback: CallbackType): AbortController
```

- no plain objects/arrays used for modelling business data

# Separation of Concerns

- Verify clear boundaries between:
- Data access and business logic
- Business logic and presentation
- Client-side and server-side code
- UI components and state management
- Check that modules have well-defined responsibilities
- Flag code that mixes concerns (e.g., database queries in UI components)
- Verify that side effects are isolated and predictable

# SOLID

## Single Responsibility Principle (SRP)

- Each module, class, or function should handle one concept
- Clear boundary between business logic and presentation (ui components)

## Open/Closed Principle (OCP)

- Code should be open for extension but closed for modification
- Check if new features require modifying existing code unnecessarily
- Look for opportunities to use composition, inheritance, or dependency injection
- Flag hard-coded conditionals that could be replaced with extensible patterns

## Liskov Substitution Principle (LSP)

- Subtypes must be substitutable for their base types
- Verify that derived classes/interfaces don't violate base contracts
- Check for implementations that throw unexpected errors or return incompatible types

## Interface Segregation Principle (ISP)

- Clients should not depend on interfaces they don't use
- Check for large interfaces that force implementers to provide unused methods
- Look for opportunities to split interfaces into smaller, focused ones
- Verify that components only depend on what they actually need

## Dependency Inversion Principle (DIP)

- High-level modules should not depend on low-level modules; both should depend on abstractions
- Check for direct dependencies on concrete implementations
- Verify that dependencies flow inward (toward abstractions)
- Flag modules that create their own dependencies instead of receiving them

# KISS Principle (Keep It Stupid Simple)

- Prefer simple, straightforward solutions over clever or complex ones
- Check for unnecessary abstractions or indirection
- Flag over-engineered solutions that add complexity without clear benefit
- Verify that code is readable and understandable without extensive documentation
- Look for opportunities to simplify complex logic or reduce nesting
