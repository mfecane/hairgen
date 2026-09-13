---
name: debugging
description: Use when application is failing.
tags:
    - '#vibecoding/skill'
---

- Do not guess and apply patch blindly.
- Rather identify potential places of failure and add console log to verify, whether application state at the point of failure is in the expected state. User will paste the result in chat.
- prefer using plain console logs with primitive values, do not construct ad hoc objects, logging objects is allowed if they are already constructed duging application runtime
- debuggubg code should be easily removable without requiring any existing code modification
- Keep console.logs count minimal and outpit scannable by human user. Make sure irrelevant logs are being removed after their irrelevance is confirmed.

# Visual debugging

- If possible draw temporary objects/helpers for visual debug to verify entities position, shape, raycasting rays, meshes integrity. Anything that can/should produce verifiable visual output may be used for visual debugging.
- Example - if uv's are constructed algorythmically - draw square in 3d space (wireframe) for uv bounds reference. Also draw uv's on that flat square in 3d space (wireframe).
