# SeedLang Desktop Frontend Support (Draft)

Status: Draft (non-normative)

This document defines a practical implementation path for "SeedLang supports desktop application frontend".

It is intentionally implementation-oriented and does not replace the canonical language spec:
- Canonical language spec: `docs/LANGUAGE_SPEC_REFACTOR_DRAFT.md`

## 1. Goal

Enable teams to build desktop frontends with SeedLang-driven logic while keeping production-grade desktop capabilities.

## 2. Recommended Architecture

Use a 3-layer model:

1. Shell layer (Electron/WebView host)
- Window lifecycle
- Native menu/tray
- File dialogs
- Native integrations (clipboard, notifications, shortcuts)

2. UI layer (HTML/CSS/JS renderer)
- Layout and rendering
- Component/event binding
- Local view state

3. Logic layer (SeedLang)
- Business rules
- Workflow and orchestration
- Deterministic transformations

Integration boundary:
- Renderer <-> SeedLang runtime via JSON messages
- Shell <-> Renderer via IPC

## 3. Scope for MVP

MVP includes:
- Single window app
- Sidebar + content area
- Route switch (2-3 pages)
- Open/save file via native dialog
- Global app state
- Basic command palette

MVP excludes:
- Plugin marketplace
- Full IDE-grade editor core
- Multi-process extension host

## 4. Runtime Contract (Proposed)

The host provides a minimal desktop bridge:

- `desktop.openFile() -> { path, content } | null`
- `desktop.saveFile(path content) -> { ok, error? }`
- `desktop.selectDirectory() -> { path } | null`
- `desktop.notify(title body) -> { ok }`
- `desktop.invoke(command payload) -> { ok, data?, error? }`

Data format:
- UTF-8 strings
- JSON object payloads only
- Explicit error objects, no implicit throw across IPC boundary

## 5. Build and Packaging

Suggested pipeline:

1. Build SeedLang logic to JS artifact(s)
2. Bundle renderer assets
3. Build Electron main/preload
4. Package desktop app

Release targets:
- Windows first
- macOS/Linux as phase 2

## 6. Security Baseline

Must-have defaults:
- `contextIsolation: true`
- `nodeIntegration: false`
- Preload allowlist APIs only
- Validate all IPC channels and payload schemas
- Disable remote content by default

## 7. Developer Experience Requirements

Minimum DX requirements:
- Hot reload for renderer
- Fast SeedLang logic rebuild
- Structured logs (shell/renderer/logic)
- Crash-safe error overlay in dev mode

## 8. Conformance Notes

For language behavior, this draft must defer to canonical spec:
- `%` modulo operator: supported
- `while` and `for-in`: both supported
- Comma-separated forms: cause LexerError in interpreter mode; accepted as deprecated style in VM mode. Always use spaces.

## 9. Milestones

Phase 1 (MVP, 1-2 weeks):
- Shell + bridge + sample app

Phase 2 (stability, 1-2 weeks):
- Error handling, schema validation, basic telemetry

Phase 3 (productization, 2-4 weeks):
- Installer, auto-update, signing, CI packaging

