import { encode } from '@jridgewell/sourcemap-codec';
import type { SourceMapSegment } from '@jridgewell/sourcemap-codec';

/** Line-oriented map: each emitted JS line maps to the same-index .seed line (clamped). Not AST-accurate. */
export function buildSeedCompileSourceMap(params: {
  generatedJs: string;
  seedSource: string;
  seedFileBasename: string;
  outJsBasename: string;
}): string {
  const { generatedJs, seedSource, seedFileBasename, outJsBasename } = params;
  const outLineCount = generatedJs.split('\n').length;
  const srcLineCount = Math.max(1, seedSource.split('\n').length);
  const decoded: SourceMapSegment[][] = [];
  for (let genLine = 0; genLine < outLineCount; genLine++) {
    const srcLine = Math.min(genLine, srcLineCount - 1);
    decoded.push([[0, 0, srcLine, 0]]);
  }
  const map = {
    version: 3,
    file: outJsBasename,
    sourceRoot: '',
    sources: [seedFileBasename],
    sourcesContent: [seedSource],
    names: [] as string[],
    mappings: encode(decoded),
  };
  return JSON.stringify(map);
}

export function appendSourceMappingUrl(js: string, mapBasename: string): string {
  const tail = js.endsWith('\n') ? js : `${js}\n`;
  return `${tail}//# sourceMappingURL=${mapBasename}\n`;
}
