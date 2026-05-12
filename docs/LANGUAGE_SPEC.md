# SeedLang Language Specification

> Status: Redirect (non-normative)
> Canonical standard: `docs/LANGUAGE_SPEC_REFACTOR_DRAFT.md`

This file no longer defines language rules.

To avoid conflicting standards, all normative language definitions are maintained in:

- `docs/LANGUAGE_SPEC_REFACTOR_DRAFT.md`

**First runnable line:** `print("Hello World")` — run `node dist/cli.js examples/hello/hello.seed` from the repo root after `npm run build` (see root `README.md`). For a longer syntax tour, see `docs/AI_QUICK_START.md`.

**Input / output:** `print` for stdout; `readFile` / `writeFile` for file IO (see `examples/hello/io_read_file.seed`). See `docs/AI_QUICK_START.md` and `docs/LANGUAGE_SPEC_REFACTOR_DRAFT.md` §8.2 for stdin notes.

**Why syntax can feel “busy”:** optional commas, alternate operator spellings, and multiple `for` forms are documented as one compatibility surface; see `docs/SYNTAX_MENTAL_MODEL.md` (Chinese) and `docs/LANGUAGE_SPEC_REFACTOR_DRAFT.md` §4.2.1.

Migration note:

- Historical mixed content (runtime APIs, SDK docs, optimization internals) has been removed from this entry point.
- If any document conflicts with the canonical spec, the canonical spec wins.
