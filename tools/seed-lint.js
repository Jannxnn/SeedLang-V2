#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

const DEFAULTS = {
  strict: false,
  json: false,
  configPath: null,
  targets: [],
  maxLineLength: 140,
  maxStringLength: 2000,
  maxConcatChain: 8,
  maxInlineScriptLength: 2000,
  ignoreDirs: [".git", "node_modules", "dist", ".trae", ".vscode"]
};

const NUMERIC_KEYS = ["maxLineLength", "maxStringLength", "maxConcatChain", "maxInlineScriptLength"];
const ALLOWED_CONFIG_KEYS = ["strict", "json", "targets", "ignoreDirs", ...NUMERIC_KEYS];

function isObject(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}

function pickDefined(obj, keys) {
  const out = {};
  for (const key of keys) {
    if (obj[key] !== undefined) out[key] = obj[key];
  }
  return out;
}

function parseNumberArg(arg, key) {
  const raw = arg.split("=")[1];
  const n = Number(raw);
  if (!Number.isFinite(n)) {
    throw new Error(`Invalid value for ${key}: ${raw}`);
  }
  return n;
}

function parseArgs(argv) {
  const cli = {
    targets: []
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--strict") {
      cli.strict = true;
      continue;
    }
    if (arg === "--json") {
      cli.json = true;
      continue;
    }
    if (arg.startsWith("--config=")) {
      cli.configPath = arg.split("=")[1];
      continue;
    }
    if (arg.startsWith("--max-line-length=")) {
      cli.maxLineLength = parseNumberArg(arg, "--max-line-length");
      continue;
    }
    if (arg.startsWith("--max-string-length=")) {
      cli.maxStringLength = parseNumberArg(arg, "--max-string-length");
      continue;
    }
    if (arg.startsWith("--max-concat-chain=")) {
      cli.maxConcatChain = parseNumberArg(arg, "--max-concat-chain");
      continue;
    }
    if (arg.startsWith("--max-inline-script-length=")) {
      cli.maxInlineScriptLength = parseNumberArg(arg, "--max-inline-script-length");
      continue;
    }
    cli.targets.push(arg);
  }

  return cli;
}

function loadConfig(cliConfigPath, cwd) {
  const autoPath = path.join(cwd, "seedlint.config.json");
  const configPath = cliConfigPath ? path.resolve(cwd, cliConfigPath) : autoPath;
  const exists = fs.existsSync(configPath);
  if (!exists) {
    return {
      config: {},
      configPath: null
    };
  }

  const raw = fs.readFileSync(configPath, "utf8");
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`Failed to parse config file ${configPath}: ${err.message}`);
  }
  if (!isObject(parsed)) {
    throw new Error(`Config file ${configPath} must be a JSON object.`);
  }

  const unknown = Object.keys(parsed).filter((k) => !ALLOWED_CONFIG_KEYS.includes(k));
  if (unknown.length > 0) {
    throw new Error(`Unknown config keys in ${configPath}: ${unknown.join(", ")}`);
  }

  return {
    config: parsed,
    configPath
  };
}

function buildOptions(cli) {
  const cwd = process.cwd();
  const { config, configPath } = loadConfig(cli.configPath, cwd);
  const configNumeric = pickDefined(config, NUMERIC_KEYS);
  const cliNumeric = pickDefined(cli, NUMERIC_KEYS);

  const merged = {
    ...DEFAULTS,
    ...configNumeric,
    ...cliNumeric
  };

  if (config.strict !== undefined) merged.strict = Boolean(config.strict);
  if (config.json !== undefined) merged.json = Boolean(config.json);
  if (cli.strict !== undefined) merged.strict = Boolean(cli.strict);
  if (cli.json !== undefined) merged.json = Boolean(cli.json);

  const baseIgnore = Array.isArray(DEFAULTS.ignoreDirs) ? DEFAULTS.ignoreDirs : [];
  const configIgnore = Array.isArray(config.ignoreDirs) ? config.ignoreDirs : [];
  merged.ignoreDirs = [...new Set([...baseIgnore, ...configIgnore])];

  if (Array.isArray(config.targets)) {
    merged.targets = config.targets.slice();
  }
  if (Array.isArray(cli.targets) && cli.targets.length > 0) {
    merged.targets = cli.targets.slice();
  }
  if (!Array.isArray(merged.targets) || merged.targets.length === 0) {
    merged.targets = [cwd];
  }

  merged.configPath = configPath;
  return merged;
}

function collectSeedFiles(targetPath, files, ignoreDirsSet) {
  if (!fs.existsSync(targetPath)) return;
  const stat = fs.statSync(targetPath);
  if (stat.isFile()) {
    if (targetPath.endsWith(".seed")) {
      files.push(path.resolve(targetPath));
    }
    return;
  }
  if (!stat.isDirectory()) return;

  const entries = fs.readdirSync(targetPath, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory() && ignoreDirsSet.has(entry.name)) continue;
    collectSeedFiles(path.join(targetPath, entry.name), files, ignoreDirsSet);
  }
}

function lineAndColumnAt(content, index) {
  const before = content.slice(0, index);
  const lines = before.split(/\r?\n/);
  const line = lines.length;
  const column = lines[lines.length - 1].length + 1;
  return { line, column };
}

function addFinding(findings, level, code, message, line, column) {
  findings.push({ level, code, message, line, column });
}

function lintLineLength(content, options, findings) {
  const lines = content.split(/\r?\n/);
  lines.forEach((line, idx) => {
    if (line.length > options.maxLineLength) {
      addFinding(
        findings,
        "warn",
        "line-too-long",
        `Line length ${line.length} exceeds max ${options.maxLineLength}`,
        idx + 1,
        options.maxLineLength + 1
      );
    }
  });
}

function lintConcatChains(content, options, findings) {
  const lines = content.split(/\r?\n/);
  lines.forEach((line, idx) => {
    const plusCount = (line.match(/\s\+\s/g) || []).length;
    if (plusCount >= options.maxConcatChain) {
      addFinding(
        findings,
        "warn",
        "concat-chain-too-long",
        `Concat chain (${plusCount + 1} parts) exceeds max ${options.maxConcatChain + 1}`,
        idx + 1,
        1
      );
    }
  });
}

function lintLongStrings(content, options, findings) {
  const patterns = [/\"([^"\\]|\\.)*\"/g, /`[\s\S]*?`/g];
  for (const regex of patterns) {
    let match = regex.exec(content);
    while (match) {
      const raw = match[0];
      const len = raw.length - 2;
      if (len > options.maxStringLength) {
        const pos = lineAndColumnAt(content, match.index);
        addFinding(
          findings,
          "warn",
          "string-too-long",
          `String length ${len} exceeds max ${options.maxStringLength}`,
          pos.line,
          pos.column
        );
      }
      match = regex.exec(content);
    }
  }
}

function lintInlineScript(content, options, findings) {
  const openTag = "<script";
  const closeTag = "</script>";
  let cursor = 0;
  while (cursor < content.length) {
    const openIdx = content.indexOf(openTag, cursor);
    if (openIdx === -1) break;
    const scriptStart = content.indexOf(">", openIdx);
    if (scriptStart === -1) break;
    const closeIdx = content.indexOf(closeTag, scriptStart + 1);
    if (closeIdx === -1) break;
    const inlineLen = closeIdx - (scriptStart + 1);
    if (inlineLen > options.maxInlineScriptLength) {
      const pos = lineAndColumnAt(content, openIdx);
      addFinding(
        findings,
        "warn",
        "inline-script-too-long",
        `Inline <script> length ${inlineLen} exceeds max ${options.maxInlineScriptLength}; move to external .js file`,
        pos.line,
        pos.column
      );
    }
    cursor = closeIdx + closeTag.length;
  }
}

function lintFile(filePath, options) {
  const findings = [];
  const content = fs.readFileSync(filePath, "utf8");
  lintLineLength(content, options, findings);
  lintLongStrings(content, options, findings);
  lintConcatChains(content, options, findings);
  lintInlineScript(content, options, findings);
  return findings;
}

function applySeverity(findings, strict) {
  return findings.map((f) => ({
    ...f,
    effectiveLevel: strict ? "error" : f.level
  }));
}

function countBySeverity(findingsWithLevel) {
  let warnings = 0;
  let errors = 0;
  for (const f of findingsWithLevel) {
    if (f.effectiveLevel === "error") errors += 1;
    if (f.effectiveLevel === "warn") warnings += 1;
  }
  return { warnings, errors };
}

function printFindings(filePath, findingsWithLevel) {
  for (const f of findingsWithLevel) {
    const level = f.effectiveLevel;
    console.log(`${filePath}:${f.line}:${f.column}  ${level.toUpperCase()}  [${f.code}] ${f.message}`);
  }
}

function printJson(payload) {
  console.log(JSON.stringify(payload, null, 2));
}

function main() {
  const cli = parseArgs(process.argv.slice(2));
  const options = buildOptions(cli);
  const files = [];
  const ignoreDirsSet = new Set(options.ignoreDirs);
  options.targets.forEach((t) => collectSeedFiles(path.resolve(t), files, ignoreDirsSet));

  const result = {
    options: {
      strict: options.strict,
      json: options.json,
      configPath: options.configPath,
      maxLineLength: options.maxLineLength,
      maxStringLength: options.maxStringLength,
      maxConcatChain: options.maxConcatChain,
      maxInlineScriptLength: options.maxInlineScriptLength
    },
    files: [],
    summary: {
      fileCount: files.length,
      warningCount: 0,
      errorCount: 0
    }
  };

  if (files.length === 0) {
    if (options.json) {
      printJson(result);
    } else {
      console.log("No .seed files found.");
    }
    process.exit(0);
  }

  for (const filePath of files) {
    const rawFindings = lintFile(filePath, options);
    const findings = applySeverity(rawFindings, options.strict);
    const counts = countBySeverity(findings);
    result.summary.warningCount += counts.warnings;
    result.summary.errorCount += counts.errors;
    result.files.push({
      filePath,
      findings
    });
    if (!options.json && findings.length > 0) {
      printFindings(filePath, findings);
    }
  }

  if (options.json) {
    printJson(result);
  } else {
    const summary =
      `Seed Lint: ${result.summary.fileCount} file(s), ` +
      `${result.summary.warningCount} warning(s), ${result.summary.errorCount} error(s)`;
    console.log(summary);
  }

  if (result.summary.errorCount > 0) process.exit(1);
}

try {
  main();
} catch (err) {
  const cli = parseArgs(process.argv.slice(2));
  if (cli.json) {
    printJson({
      error: err.message
    });
  } else {
    console.error(err.message);
  }
  process.exit(1);
}
