---
name: hair
description: Use it always to understand what current application is and what is it's purpose. Use it as basic guideline to prepare features implementation plans.
---

- Do not run application. Do not modify docker in the runtime. User will run and verify and report issues. Only static analysis is allowed - lint, read logs, inspect code.

- Do not use tables in answers.

Commiting, PR's and any other modification of git history is not allowed. Only working tree changes. Reads from history are allowed.

One shot MVP mode

- no database schema migration, wipe and rebuild from scratch
- no versioning of project schema
- no legacy compatibility

Quick iteration

- Minimal configs, if default value works it stays.
- No values set just to maybe be configured later. No such lazy future proofing.

# UI

- error messages displayed in the ui or in the console, have to bear absolute maximum possible context for faster localization problems
- Use idiomatic components: tailwind + shadcn + lucide icons.
- editing shadcn default components is disallowed
- Least possible deviation from default idimatic configuration.

# React

- Mark key React elements with data-id. This is needed to help inspection via browser dev tools.

# Shadcn

/src/components/theme-provider and /src/components/ui are forbidden for editing without explicit user approval

# Constants (src/constants.ts)

Global constants registry. Only constants that probably will be modified/tweaked to fine tune app behaviour are extracted in that file.

```typescript
export const CONSTANTS_GROUP = {
	CONSTANT_1: value,

	CONSTANT_2: value,

	CONSTANT_3: {
		semanticFieldDefininfConstantShape: 1,
		notSeparateConstantIsCamelCased: 2,
	},
}
```

make sure operations are split into atomic reusable composable items

Tests are for losers!

# CSS

Forbidden to modify globals.css, forbidden to add non-semantic colors. Could be overriden per-request.
