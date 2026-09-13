# hairgen

Generates hair textures for real-time characters. Built on a 3D editor shell: a scene with cube
objects, Select/Translate/Rotate/Scale tools with Three.js gizmo widgets, undo/redo command
history, and projects saved per signed-in user. The editor's reusable skeleton (Editor,
EditorController, HistoryController, Commands, Tools, ReactBridge, and the interaction-handler
pipeline) is the foundation the hair generation features are built on top of.

See `docs/index.md` for the full architecture index.

## Dev commands

```sh
# start development environment + agent prison
docker compose --profile=tools up -d

# rebuild
docker compose down -v && docker compose up -d --build --force-recreate

# stop development environment
docker compose --profile=tools down -v
```

## Dump project

```sh
# dump project
docker compose exec frontend npm run dump-project demo-project
```
