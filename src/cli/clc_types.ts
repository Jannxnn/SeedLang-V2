export const CLC_EXPR_UNSUPPORTED_HINTS: Readonly<Record<string, string>> = {
  Await: 'async/await is not supported in C backend (no native coroutines)',
  YieldExpr: 'yield/generators are not supported in C backend',
  GenericCall: 'generics are not supported in CLC',
  NounRef: 'natural language references are not supported in CLC',
  Block: 'block expressions are not supported in CLC',
};

export const CLC_STMT_UNSUPPORTED_HINTS: Readonly<Record<string, string>> = {
  Import: 'module system (import/export) is not supported in CLC — C uses #include instead',
  Export: 'module system (import/export) is not supported in CLC',
  AsyncFunctionDef: 'async functions are not supported in C backend (no native coroutines)',
  CoroutineDef: 'coroutines are not supported in C backend',
  Yield: 'yield is not supported in C backend',
  InterfaceDef: 'interfaces are not supported in CLC (experimental feature)',
  TypeAlias: 'type aliases are not supported in CLC (experimental feature)',
  TypeAnnotation: 'type annotations are not supported in CLC (experimental feature)',
  WebDirective: 'web directives are not applicable in C backend',
  WebDirectiveBlock: 'web directives are not applicable in C backend',
  Declaration: 'natural language declarations are not supported in CLC',
  Question: 'natural language questions are not supported in CLC',
};

export function getClcUnsupportedBoundary(): { expressions: string[]; statements: string[] } {
  return {
    expressions: Object.keys(CLC_EXPR_UNSUPPORTED_HINTS).sort(),
    statements: Object.keys(CLC_STMT_UNSUPPORTED_HINTS).sort(),
  };
}

export class ClcCompileError extends Error {
  readonly warnings: readonly string[];
  readonly exitCode = 2;
  constructor(warnings: string[]) {
    const first = warnings[0] || '(no detail)';
    super(`[CLC] strict compile failed: ${warnings.length} issue(s). First: ${first}`);
    this.name = 'ClcCompileError';
    this.warnings = warnings;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
