# Docs index

- [Projects and auth](projects-and-auth.md) - persisted projects, `/projects`, `/editor/[projectId]`, sign-in redirects
- [Editor architecture](editor/architecture.md) - command history, scene model, tools, transform gizmo, viewports
- [Hair cards](editor/hair-cards-plan.md) - card model, list/options panels, rectangle gizmo, strand generation, and project-wide texture baking
- [Hair card strand tuning](editor/hair-card-strand-tuning.md) - strand centerline origin/height, per-card length, global thickness, height variance, unselected-card visual
- [Hair card modifiers](editor/hair-card-modifiers.md) - per-card reorderable modifier stack (twist, noise, clump, braid)
- [Groom editor](editor/groom-editor-plan.md) - the separate `/editor/[projectId]/groom` editor: spline placement/vertex gizmos with smooth-modify falloff, hair-card "card strip" instancing with view modes/ghosting, own `groom`/`bakedMaps` columns
