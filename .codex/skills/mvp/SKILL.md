---
name: mvp
description: Use when building MVPs, prototypes, or early-stage/throwaway projects — especially when the user says "MVP," "quick prototype," "one-shot," "just get it working," or is clearly iterating fast without needing production durability. Also applies mid-project if the user signals they don't care about migrations, versioning, or future-proofing yet.
---

One shot MVP mode

- no database schema migration, wipe and rebuild from scratch
- no versioning of project schema
- no legacy compatibility

Quick iteration

- Minimal configs, if default value works it stays.
- No values set just to maybe be configured later. No such lazy future proofing.
