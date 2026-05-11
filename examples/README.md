# Examples Directory Guide

This directory contains runnable examples and comparison demos.

## Layout

- `compare/`: same web app implemented in multiple stacks for comparison
- `desktop-frontend-mvp/`: SeedLang desktop frontend scaffold (Electron + renderer)
- `website/`: website build/server scripts, Seed sources, and templates
- `games/`: game examples and render/logic scripts
- `debug/`: parser/compiler debugging scripts
- `sandbox/`: standalone sample Seed files and object parsing demos

## Quick Entry

- Compare demos: `compare/cpp/`, `compare/js/`, `compare/python/`, `compare/rust/`
- Desktop frontend MVP: see `desktop-frontend-mvp/README.md`
- Website demo: `website/website_server.js`
- Game demo: `games/games.seed`

## Maintenance Notes

- Keep current runnable artifacts in `compare/` and `desktop-frontend-mvp/` as requested.
- Prefer adding new examples in dedicated subfolders instead of placing more files at root.
- For each new example, include:
  - short `README.md`
  - run command
  - dependency notes
