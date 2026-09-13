---
name: react
description: Use whenever writing, editing, or reviewing React components — .tsx/.jsx files, hooks, JSX markup, component props/state, or any frontend UI work in a React codebase. Trigger this even if the user just says "add a component," "fix this UI," or pastes JSX without saying "React" explicitly. Always consult this before writing or modifying any React/tsx code.
---

# React

- Ensure root-level elements of components for large menus/panels/headers are identified with data-id property even if it is not used for styling of dom queries. It is needed for LLM context and ease of inspection via browser dev tools.

- Collapse long-ass className's containing multiple tailwind classes to construction like this:

```
className = cn(
	'class1 class2 class3',
	'class4 class5 class6',
)
```

with line length not exceeding 120 characters

# Components

- components are as dumb as possible
- custom logic is extracted into reusable hooks.
- before implementing logic onside the component, research app for existing hooks and whether they can be reused right away or refactored to make them reusable
- keep components in separate files (for saving coding agent context)
- extract logical parts of the view markup into separate components. The reasons for splitting into components
    - Readability (huge markup code is hard to scan)
    - Organization, focus
    - Save LLM context
    - Testability
    - Reusability
- page gatweays do not contain any markup, just select and render appropriate root level component and that's it.

- Do not leak prompt details into irrelevant text into UI.
