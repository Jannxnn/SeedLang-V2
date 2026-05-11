export {
  CLC_WIN32_RT_FILENAME,
  CLC_WIN32_ENTRY_W_WINMAIN,
  CLC_WIN32_LIBS_MINGW,
  resolvePreferredMingwGcc as resolveMingwGcc,
  getClcWin32MingwLibFlags,
  getClcWin32GccLinkSuffix,
  getClcWin32MsvcPragmaLibs,
  getClcWin32MsvcLinkLibs,
  resolveClcWin32RtSourcePath,
  resolveClcWin32ToolsClcDir,
  resolvePreferredMingwGcc
} from './cli/clc_win32_link';

export { runClcNativeCompile } from './cli/cli_clc_native';
export type { ClcNativeCompileOptions } from './cli/cli_clc_native';

export { Lexer } from './core/lexer';
export { Parser, parse } from './core/parser';
export { Interpreter, SeedValue, Environment, RuntimeError, ReturnSignal } from './core/interpreter';
export { expandMacrosInProgram, MAX_MACRO_EXPAND_DEPTH } from './core/macro_expand';
export { YieldSignal } from './core/coroutine';
export { WebRuntime } from './runtime/web';
export { AgentRuntime, AgentConfig, Task } from './runtime/agent';
export { GameRuntime, GameObject, GameScene, GameInput, GameAudio } from './runtime/game';
export { MobileRuntime } from './runtime/mobile';
export type { MobileRuntimeOptions, MobileDeviceProfile } from './runtime/mobile';
export { EmbeddedRuntime } from './runtime/embedded';
export type { EmbeddedRuntimeOptions } from './runtime/embedded';

import { parse } from './core/parser';
import { Interpreter } from './core/interpreter';
import { WebRuntime } from './runtime/web';
import { AgentRuntime, AgentConfig } from './runtime/agent';
import { GameRuntime } from './runtime/game';
import { MobileRuntime, MobileRuntimeOptions } from './runtime/mobile';
import { EmbeddedRuntime, EmbeddedRuntimeOptions } from './runtime/embedded';

export function run(source: string, mode: 'general' | 'web' | 'agent' | 'game' | 'mobile' | 'embedded' = 'general'): any {
  switch (mode) {
    case 'web': {
      const webRuntime = new WebRuntime();
      return webRuntime.runWeb(source);
    }
    case 'agent': {
      const agentRuntime = new AgentRuntime();
      return agentRuntime.runAgent(source);
    }
    case 'game': {
      const gameRuntime = new GameRuntime();
      return gameRuntime.runGame(source);
    }
    case 'mobile': {
      const mobileRuntime = new MobileRuntime();
      return mobileRuntime.run(source);
    }
    case 'embedded': {
      const embeddedRuntime = new EmbeddedRuntime();
      return embeddedRuntime.run(source);
    }
    default: {
      const interpreter = new Interpreter();
      const program = parse(source);
      return interpreter.interpret(program);
    }
  }
}

export function createInterpreter(): Interpreter {
  return new Interpreter();
}

export function createWebRuntime(): WebRuntime {
  return new WebRuntime();
}

export function createAgentRuntime(config?: Partial<AgentConfig>): AgentRuntime {
  return new AgentRuntime(config);
}

export function createGameRuntime(): GameRuntime {
  return new GameRuntime();
}

export function createMobileRuntime(options?: MobileRuntimeOptions): MobileRuntime {
  return new MobileRuntime(options);
}

export function createEmbeddedRuntime(options?: EmbeddedRuntimeOptions): EmbeddedRuntime {
  return new EmbeddedRuntime(options);
}

export default {
  run,
  parse,
  createInterpreter,
  createWebRuntime,
  createAgentRuntime,
  createGameRuntime,
  createMobileRuntime,
  createEmbeddedRuntime
};
