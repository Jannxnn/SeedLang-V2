/**
 * CLC 嵌入的 C 运行时文本：来自仓库内唯一来源 {@link tools/clc/sl_runtime.h}。
 */
import * as fs from 'fs';
import * as path from 'path';

function loadSlRuntimeHeader(): string {
  const p = path.resolve(__dirname, '..', '..', 'tools', 'clc', 'sl_runtime.h');
  if (!fs.existsSync(p)) {
    throw new Error(
      `Seed CLC: runtime header not found at ${p}. ` +
        'Use the full seedlang package (includes tools/clc/sl_runtime.h) or clone the repo.'
    );
  }
  return fs.readFileSync(p, 'utf-8');
}

/** Full sl_runtime.h contents for compileToC output (read once at module load). */
export const SL_RUNTIME: string = loadSlRuntimeHeader();
