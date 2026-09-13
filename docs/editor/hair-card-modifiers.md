# Hair card modifiers

Builds on `hair-card-strand-tuning.md`'s strand-generation baseline. A hair card's `modifiers`
(`SceneObjectData.modifiers`) is an ordered, per-card stack of shape modifiers - twist, noise,
clump, braid (`src/lib/hair/modifiers`) - reorderable via drag-and-drop in `HairCardOptionsPanel`
(`HairCardModifierStackPanel`, `@dnd-kit`). Reordering changes the result: each modifier sees the
previous one's output (`HairCardModifierStack.apply`), so twist-then-braid and braid-then-twist
look different.

## Pipeline: translate before modify, not after

`HairCardStrandsGenerator.generate` used to build each strand's finished geometry, then translate
it to its root position. Modifiers moved that translation earlier - every strand's raw centerline
(`HairStrandCenterlineCurve.getSpacedPoints`) is placed at its root immediately, before the
modifier stack runs, and geometry is only built afterward
(`HairStrandGeometryGenerator.generateFromCenterline`). Twist/noise only need a strand's own points;
clump/braid need to compare strand roots against each other to group them, which only works once
every strand already carries its real card-space position.

## `HairStrandGeometryGenerator.generateFromCenterline`

Same tube/taper/cap build as `generate()`, from an explicit point array instead of a
`HairStrandCenterlineCurve` it builds itself. The `TubeGeometry` path is a `CatmullRomCurve3`
through those points rather than the analytic curve, since a modifier-reshaped centerline is just
points, not a re-evaluable curve. `TubeGeometry` resamples that spline by its own arc length, which
can drift a hair from the input points if a modifier left them unevenly spaced - acceptable at
hair-strand thinness, not exact CAD. `segmentsForLength(length)` is exposed as its own method so
`HairCardStrandsGenerator` can presample a strand's raw centerline before this class ever sees it.

## Twist

Rotates every point around the vertical line through its own root, angle growing linearly with `t`
(0 at the root, `amount * HAIR_CARD.MODIFIERS.TWIST.MAX_TURNS` full turns at the tip). Same axis
`HairStrandCenterlineCurve`'s class doc already anticipated a twist modifier using.

## Noise

Per-strand sine-wave jitter in X/Z, phase drawn from the card's seeded PRNG (continued from root
sampling, so it's deterministic per card) rather than a real noise function - a seeded sine reads
the same as value noise at hair-strand scale, with no added dependency. Scaled by `t` so the root
never moves.

## Clump

Seeded k-means (fixed iteration count, `HAIR_CARD.MODIFIERS.CLUMP.KMEANS_ITERATIONS`) groups strand
roots into `regionCount` clusters. The `strayFraction` of strands ranked farthest from their
cluster's center are left untouched. Every remaining strand's own shape - its points relative to its
own root, not its absolute position - is blended by `strength` toward its region's average shape
(sampled at `SHAPE_SAMPLE_COUNT` even steps and averaged across members). Reads as strands within a
region bending together, not every strand's tip collapsing onto one shared point.

## Braid

Chunks strand roots (sorted by X) into `groupSize`-strand groups - a card's root-sampling strip is
narrow in Y relative to its width, so X alone already separates one group from the next. Each
group's members get a `2*PI*k/groupSize` phase offset onto a shared helix around the group's
centroid root, blended in by `strength * t`. Leftover strands that don't fill a full group are left
unmodified.

## Undo model

One command per mutation kind, matching `SetHairCardStrandSettingsCommand`'s precedent
(`AddHairCardModifierCommand`, `RemoveHairCardModifierCommand`, `ReorderHairCardModifierCommand`,
`SetHairCardModifierCommand` - the last covers both a params edit and the enabled toggle, a
whole-modifier before/after snapshot). Live param drags write `object.modifiers` directly (no
history) via `Editor.setHairCardModifier`, exactly like `setHairCardStrandSettings`; the drag's
`onValueCommit` pushes the undoable command via `Editor.commitHairCardModifier`.
