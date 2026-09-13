---
name: editor-architecture
description: Use when building, extending, or reviewing web editor architecture.
---

# Generic editor architecture

## Concepts

- Clear separataion of React view layer and business logic layer. No business logc should be implemented in React components or hooks.

## Ownership hierarchy

- Editor
    - Project (persistent, serialized state)
    - EditorController (mutation entry point)
        - Tools
        - HistoryController
        - Commands
        - services/repositories/save-load
    - ReactBridge (UI-only ephemeral state)
    - Interaction system (owned by Controller)

# Editor

- Editor - root object owns everything, services, controller, ReactBridge, three.js / pixi.js rendering.

- Project - owns persistent state, which should be serialized between editor sessions.

- EditorController owns application state including project and methods to modify it. Also it owns tools, HistoryController, commands. All the abstractions that do mutate application state.

- HistoryController - application's state is mutated via command interface - undoable / redoable. Applies / tracks / unapplies commands. Commands are built via CommandFactory

```
interface EditorCommand {
	execute(): void
	undo?(): void
	redo?(): void
	isUndoable?(): boolean
}
```

- Editor is instanciated via useEditor hook

- ReactBridge, useReactBridge - syncs editor UI state to React UI layer

- React UI layer, Views (tsx files) - react components, minimum logic, only local state is allowed.

- ReactBridge - owns dom ui-only global state - state that only required to update the UI. react bridge is accessed by components via useReactBridge hook.

- Resource repositories, save/load controllers, service classes, math processors and such are owned by editor controller.

- Command interface, commands are built via CommandFactory

## React integration

- useEditor — await for resources required to build editor instance, create editor instance and manage editor lifetime

- useEditorStore — store editor reference in zustand-powered store, editor lifetime variables - loading, error. No other data should be in the store, anything else - use ReactBridge and it's internal state.

- useReactBridge — access to ReactBridge instance

## Editor workspace

- single interactable view panel - either svg canvas/pixi.js canvas/three.js canvas
- dom element
- attaches event listeners
- owns interaction system

## Interaction system

Is owned by editor workspace. Consists of:

- CanvasEventHandler - raw events pre-processor, detects drag, double click, single click. Builds synthetic InteractionEvent object. Owns hit tester and anything else, required to build InteractionEvent.

- InteractionEvent - synthetic event abstration, wrapped around native event. Contains all the required event payload, including it testing result. Event payload can be wrapped into InteractionContext object.

```
interface InteractionEvent {
	type: CanvasEventType
	x: number
	y: number
	dx: number
	dy: number
	modifiers: InteractionEventModifiers
	context: InteractionContext
	raw: Event
}
```

- InteractionHandlerRouter - dispatches synthetic event object to handlers. decides which handler should be called based on handler's ability to handle certain event, whether handler is capturing the events, handlers prority.

- InteractionHandler interface - event handler interface. Consumes and handles InteractionEvent. Uses commands and controller to mutate application state. Has priority numeric value - handlers are selected and excuted based in the priority. Is able to capture/release event processing pipeline.

```
interface InteractionHandler {
	id: string
	priority: number
	enabled: boolean
	isEnabled(context: InteractionEvent): boolean
	onEvent(event: InteractionEvent): Promise<InteractionHandlerResult>
}
```

- Each event handler returns InteractionHandlerResult.

```
interface InteractionHandlerResult {
	capture: boolean = false
	releaseCapture: boolean = false
	pass: boolean = true
	setHandled(): InteractionHandlerResult
	setCapture(): InteractionHandlerResult
	setReleaseCapture(): InteractionHandlerResult
	setPass(): InteractionHandlerResult
}
```
