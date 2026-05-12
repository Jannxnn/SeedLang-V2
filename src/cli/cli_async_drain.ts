import type { SeedValue } from '../core/interpreter';

/**
 * Await SeedLang-level promises left in the interpret result list (e.g. top-level
 * `main()` returning a Promise from an async function). Does not run the whole event loop.
 */
export async function drainInterpretStatementResults(results: SeedValue[]): Promise<void> {
  for (const r of results) {
    await drainSeedValue(r);
  }
}

async function drainSeedValue(v: SeedValue | undefined): Promise<void> {
  if (!v || typeof v !== 'object') return;
  if (v.type === 'promise' && v.value instanceof Promise) {
    const resolved = await v.value;
    await drainSeedValue(resolved as SeedValue);
  }
}
