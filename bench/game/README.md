# Game Bench Monitoring Guide

This directory contains the game-oriented benchmark gate and trend scripts.

## Scope

- Primary stability target: `G10`
- Primary metrics:
- `passRate` (latest 7 runs)
- `avgP95` (latest 7 runs)
- `stdP95` (latest 7 runs)

## Run Commands

- CI gate (single sample):
- `npm run bench:game:ci`
- Trend report (non-blocking by default):
- `npm run bench:game:trend`
- Trend report (strict exit):
- `npm run bench:game:trend:strict`

## Monitoring Mode

- Default mode: monitor only, no VM code changes.
- Suggested low-frequency patrol:
- once per day
- or once after each VM runtime change

## Stop Optimization Conditions

When all of the following are true, stop active optimization and keep monitor-only mode:

- `passRate = 100%` in recent windows
- `avgP95 <= 2.30ms`
- `stdP95 <= 0.22`
- no recent `FAIL` in gate runs

## Restart Optimization Conditions

Restart targeted optimization only when at least one of the following is triggered:

- any `FAIL` appears in gate runs
- `avgP95 > 2.4ms` for 2 consecutive runs (aggressive mode)
- `stdP95 > 0.35`

## Current Policy

- Keep `G10` as the first-priority stability KPI.
- Prefer stability over aggressive micro-optimizations.
- Use single-axis changes only (one hotspot class per optimization round).
- Current threshold profile is set to aggressive mode (`2.4ms` restart trigger).
