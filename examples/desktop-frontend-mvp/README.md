# SeedLang Desktop Frontend MVP (v0.4)

This is a desktop frontend scaffold with:

- Electron shell (`electron/`)
- Renderer app (`app/`)
- SeedLang logic placeholder (`seed/`)
- Route switching (`home`, `editor`, `settings`)
- Global state container (modular)
- Page modules (`pages/home|editor|settings`)
- Route guard (block `editor` before opening file)
- Command palette (`Ctrl/Cmd + K`)
- IPC payload schema validation (`saveFile`, `notify`)

## Prerequisites

- Node.js 18+
- npm

## Install

```bash
cd examples/desktop-frontend-mvp
npm install
```

## Run (Dev)

```bash
npm run dev
```

Open command palette with `Ctrl/Cmd + K`.

## Build Seed Logic (placeholder)

```bash
npm run build:seed
```

Current placeholder writes `dist/seed-logic.js`. Replace the script with real SeedLang compile flow when ready.

## Directory

```text
desktop-frontend-mvp/
  app/
    commands.js
    index.html
    pages/
      editor.js
      home.js
      settings.js
    renderer.js
    router.js
    store.js
    styles.css
    views.js
  electron/
    main.js
    preload.js
  seed/
    app.seed
  scripts/
    build-seed.js
  dist/
```

## Next Upgrade Targets

- Replace placeholder build with real SeedLang compiler pipeline
- Add error boundary UI and telemetry channel
- Add command history and keyboard navigation in palette
