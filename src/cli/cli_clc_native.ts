import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import {
  getClcWin32GccLinkSuffix,
  resolveClcWin32RtSourcePath,
  resolveClcWin32ToolsClcDir,
  resolvePreferredMingwGcc
} from './clc_win32_link';

export type ClcNativeCompileOptions = {
  parallel?: boolean;
  cuda?: boolean;
  clcRequireNative?: boolean;
  /** MinGW/MSVC Win32 link extras; omit for legacy plain console link line */
  clcSubsystem?: 'windows' | 'console';
};

function mingwLinkTail(opt: ClcNativeCompileOptions): string {
  if (!opt.clcSubsystem) return '';
  return ' ' + getClcWin32GccLinkSuffix(opt.clcSubsystem).join(' ');
}

function msvcLinkTail(opt: ClcNativeCompileOptions): string {
  if (!opt.clcSubsystem) return '/link';
  if (opt.clcSubsystem === 'windows') {
    return '/link /SUBSYSTEM:WINDOWS user32.lib gdi32.lib comdlg32.lib winmm.lib';
  }
  return '/link /SUBSYSTEM:CONSOLE';
}

/** Quoted source list: generated `.c` plus Win32 runtime when subsystem windows. */
function clcCompileSourceArgs(outputPath: string, options: ClcNativeCompileOptions): string {
  if (options.clcSubsystem !== 'windows') {
    return `"${outputPath}"`;
  }
  const rt = resolveClcWin32RtSourcePath(__dirname);
  if (!fs.existsSync(rt)) {
    console.warn(`CLC Win32: ${rt} not found — link may fail (no wWinMain)`);
    return `"${outputPath}"`;
  }
  return `"${outputPath}" "${rt}"`;
}

/**
 * After writing CLC `.c`, try local gcc / cl / gcc / clang / tcc to produce `exePath` and run once.
 */
export function runClcNativeCompile(
  outputPath: string,
  exePath: string,
  options: ClcNativeCompileOptions = {}
): void {
  const ompFlag = options.parallel ? '-fopenmp' : '';
  const gccExe = resolvePreferredMingwGcc();
  const gccQ = `"${gccExe}"`;
  const mingwExtra = mingwLinkTail(options);
  const clLink = msvcLinkTail(options);
  const srcArgs = clcCompileSourceArgs(outputPath, options);
  const toolsClcDir = resolveClcWin32ToolsClcDir(__dirname);
  const incFlag = fs.existsSync(toolsClcDir) ? ` -I"${toolsClcDir}"` : '';
  const msvcInc = fs.existsSync(toolsClcDir) ? `/I"${toolsClcDir}" ` : '';

  const compilers: { name: string; cmd: string }[] = [];
  if (options.cuda) {
    const cudaBase = 'C:\\Program Files\\NVIDIA GPU Computing Toolkit\\CUDA';
    let cudaPath = process.env.CUDA_PATH;
    if (!cudaPath && fs.existsSync(cudaBase)) {
      const versions = fs.readdirSync(cudaBase).filter(v => v.startsWith('v')).sort().reverse();
      if (versions.length > 0) cudaPath = path.join(cudaBase, versions[0]);
    }
    if (!cudaPath) cudaPath = path.join(cudaBase, 'v12.4');
    const cudaInclude = `${cudaPath}\\include`;
    const cudaLib = `${cudaPath}\\lib\\x64`;
    if (fs.existsSync(gccExe) || gccExe === 'gcc' || gccExe.endsWith('gcc.exe')) {
      compilers.push({
        name: 'gcc-O3+cuda',
        cmd: `${gccQ} -O3 -march=native ${ompFlag}${incFlag} -I"${cudaInclude}" -L"${cudaLib}" -lcudart -o ${exePath} ${srcArgs}${mingwExtra}`
      });
    }
    compilers.push({
      name: 'nvcc',
      cmd: `nvcc -O3 -o ${exePath.replace('.exe', '')} ${outputPath} -lcudart`
    });
  }
  if (fs.existsSync(gccExe) || gccExe === 'gcc' || gccExe.endsWith('gcc.exe')) {
    compilers.push({
      name: 'gcc-O3',
      cmd: `${gccQ} -O3 -march=native ${ompFlag}${incFlag} -o ${exePath} ${srcArgs}${mingwExtra}`
    });
  }
  compilers.push({
    name: 'cl',
    cmd: `cl /O2 ${options.parallel ? '/openmp ' : ''}${msvcInc}/Fe:"${exePath}" ${srcArgs} ${clLink}`
  });
  compilers.push({
    name: 'gcc',
    cmd: `gcc -O2 ${ompFlag}${incFlag} -o ${exePath.replace('.exe', '')} ${srcArgs} -lm${mingwExtra}`
  });
  compilers.push({
    name: 'clang',
    cmd: `clang -O2 ${ompFlag}${incFlag} -o ${exePath.replace('.exe', '')} ${srcArgs} -lm${mingwExtra}`
  });
  const tccPath = path.resolve(__dirname, '..', '..', 'tools', 'tcc', 'tcc', 'tcc.exe');
  if (fs.existsSync(tccPath)) {
    compilers.push({
      name: 'tcc',
      cmd: `"${tccPath}"${incFlag} -o "${exePath}" ${srcArgs}${mingwExtra}`
    });
  }

  let compiled = false;
  for (const compiler of compilers) {
    try {
      execSync(compiler.cmd, { stdio: 'pipe' });
      console.log(`   Native: ${exePath} (${compiler.name})`);
      compiled = true;
      break;
    } catch {
      /* try next */
    }
  }

  const requireNative =
    Boolean(options.clcRequireNative) || process.env.SEED_CLC_REQUIRE_NATIVE === '1';
  if (!compiled) {
    console.log(`   (Install cl, gcc, clang, or tcc to compile to native binary)`);
    if (requireNative) {
      console.error('CLC: --clc-require-native / SEED_CLC_REQUIRE_NATIVE: no C compiler succeeded (exit 3)');
      process.exit(3);
    }
  } else {
    try {
      const runEnv: NodeJS.ProcessEnv = { ...process.env };
      if (options.clcSubsystem === 'windows' && !runEnv.SEED_WIN32_AUTOCLOSE && process.stdout && !process.stdout.isTTY) {
        runEnv.SEED_WIN32_AUTOCLOSE = '1';
      }
      const result = execSync(`"${exePath}"`, { encoding: 'utf-8', timeout: 30000, env: runEnv });
      if (result) process.stdout.write(result);
    } catch (runErr: any) {
      console.error(`   Run error: ${runErr.message}`);
      if (requireNative) {
        console.error('CLC: native run failed under --clc-require-native (exit 4)');
        process.exit(4);
      }
    }
  }
}
