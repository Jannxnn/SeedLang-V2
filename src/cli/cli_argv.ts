import { printUsage, printVersion } from './cli_usage';
import { initProject } from './cli_dev_tools';

export type CliMode = 'general' | 'vm' | 'web' | 'agent' | 'game' | 'graphics';

export interface ParsedCli {
  mode: CliMode;
  filePath?: string;
  evalCode?: string;
  options: Record<string, unknown>;
  /** Handled by main after parse (async REPL). */
  startRepl?: boolean;
  /** Handled by main after parse. */
  startDebugger?: boolean;
}

/** Parse argv (without `node` / script path). Help/version/init exit the process here. */
export function parseCliArgs(argv: string[]): ParsedCli {
  let mode: CliMode = 'general';
  let filePath: string | undefined;
  let evalCode: string | undefined;
  const options: Record<string, unknown> = {};
  let startRepl = false;
  let startDebugger = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    switch (arg) {
      case '--help':
      case '-h':
        printUsage();
        process.exit(0);
        break;
      case '--version':
      case '-v':
        printVersion();
        process.exit(0);
        break;
      case '--eval':
      case '-e':
        evalCode = argv[++i];
        break;
      case '--repl':
        startRepl = true;
        break;
      case '--debugger':
        startDebugger = true;
        break;
      case '--vm':
        mode = 'vm';
        break;
      case '--web':
        mode = 'web';
        filePath = argv[++i];
        break;
      case '--agent':
        mode = 'agent';
        filePath = argv[++i];
        break;
      case '--game':
        mode = 'game';
        filePath = argv[++i];
        break;
      case '--graphics':
        mode = 'graphics';
        filePath = argv[++i];
        break;
      case '--output':
      case '-o':
        options.output = argv[++i];
        break;
      case '--ast':
        options.ast = true;
        break;
      case '--tokens':
        options.tokens = true;
        break;
      case '--debug':
        options.debug = true;
        break;
      case '--watch':
      case '-w':
        options.watch = true;
        break;
      case '--compile':
      case '-c':
        options.compile = true;
        break;
      case '--format':
        options.format = true;
        break;
      case '--lint':
        options.lint = true;
        break;
      case '--stats':
        options.stats = true;
        break;
      case '--init':
        initProject();
        process.exit(0);
        break;
      case '--minify':
        options.minify = true;
        break;
      case '--source-map':
        options.sourceMap = true;
        break;
      case '--no-memo':
        options.noMemo = true;
        break;
      case '--compile-c':
        options.compileC = true;
        break;
      case '--subsystem': {
        const sub = argv[++i];
        if (sub === 'windows' || sub === 'console') options.clcSubsystem = sub;
        break;
      }
      case '--clc-strict':
        options.clcStrict = true;
        break;
      case '--clc-require-native':
        options.clcRequireNative = true;
        break;
      case '--parallel':
        options.parallel = true;
        break;
      case '--acae-diagnostics':
        options.acaeDiagnostics = true;
        break;
      case '--acae-fuse':
        options.acaeFuseRangeLoops = true;
        break;
      case '--gpu':
        options.gpu = true;
        break;
      case '--cuda':
        options.cuda = true;
        options.gpu = true;
        break;
      case '--verbose':
        options.verbose = true;
        break;
      case '--time':
        options.time = true;
        break;
      default:
        if (!arg.startsWith('--') && !arg.startsWith('-')) {
          filePath = arg;
        }
        break;
    }
  }

  return { mode, filePath, evalCode, options, startRepl, startDebugger };
}
