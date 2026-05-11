const fs = require("fs");
const path = require("path");
const http = require("http");
const { WebRuntime } = require("../../dist/index.js");

const seedFile = path.join(__dirname, "website.seed");
const seedNoJsFile = path.join(__dirname, "website_nojs.seed");
const seedCompareFile = path.join(__dirname, "seed_compare.seed");
const seedCompareNoJsFile = path.join(__dirname, "seed_compare_nojs.seed");
const websiteScriptFile = path.join(__dirname, "website.js");
const gamesSeedFile = path.join(__dirname, "..", "games", "games.seed");
const gamesScriptFile = path.join(__dirname, "..", "games", "games.js");
const gamesLogicFile = path.join(__dirname, "..", "games", "games_logic.js");
const templateDir = path.join(__dirname, "templates");
const compiledDir = path.join(__dirname, "..", "..", "dist", "webapp");
const port = Number(process.env.PORT || 4173);
const state = {
  counter: 0,
  visits: 0,
  todos: [
    { id: 1, text: "Build dynamic API", done: false },
    { id: 2, text: "Connect Seed page", done: false }
  ],
  nextTodoId: 3
};

function renderSeedToHtml(filePath) {
  const source = fs.readFileSync(filePath, "utf8");
  const runtime = new WebRuntime();
  const results = runtime.runWeb(source);

  for (let i = results.length - 1; i >= 0; i -= 1) {
    const value = results[i];
    if (value && value.type === "string" && typeof value.value === "string" && value.value.includes("<html")) {
      return value.value;
    }
  }

  throw new Error("Seed render failed: no HTML string found in evaluation results.");
}

function sendJson(res, code, payload) {
  res.writeHead(code, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 1e6) {
        reject(new Error("Request body too large."));
      }
    });
    req.on("end", () => {
      if (!raw) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch (err) {
        reject(new Error("Invalid JSON body."));
      }
    });
    req.on("error", reject);
  });
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function injectVersionBadge(html, label, bgColor) {
  const badge = `<style>
  .seed-version-badge{
    position:fixed;top:10px;right:10px;z-index:99999;
    padding:8px 12px;border-radius:999px;font:700 12px/1 system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;
    color:#fff;background:${bgColor};box-shadow:0 6px 20px rgba(0,0,0,.28);letter-spacing:.3px
  }
  </style><div class="seed-version-badge">当前版本: ${label}</div>`;

  if (typeof html === "string" && html.includes("</body>")) {
    return html.replace("</body>", `${badge}</body>`);
  }
  return `${badge}${html}`;
}

function renderSourceSections(files) {
  return files.map((item) => {
    if (!fs.existsSync(item.filePath)) {
      return `<section class="card"><h2>${item.title}</h2><p class="muted">File not found.</p></section>`;
    }
    const content = fs.readFileSync(item.filePath, "utf8");
    return `<section class="card"><h2>${item.title}</h2><pre><code>${escapeHtml(content)}</code></pre></section>`;
  }).join("");
}

function estimateTokenCount(code) {
  if (typeof code !== "string" || code.length === 0) {
    return 0;
  }
  // Lightweight cross-language token estimate for display statistics.
  const tokens = code.match(/[A-Za-z_]\w*|\d+(?:\.\d+)?|==|!=|<=|>=|&&|\|\||=>|[{}()[\].,;:+\-*/%<>=!&|^~?:]/g);
  return tokens ? tokens.length : 0;
}

function computeSourceStats(files) {
  let fileCount = 0;
  let tokenCount = 0;
  for (const item of files) {
    if (!item || !item.filePath || !fs.existsSync(item.filePath)) {
      continue;
    }
    const content = fs.readFileSync(item.filePath, "utf8");
    fileCount += 1;
    tokenCount += estimateTokenCount(content);
  }
  return { fileCount, tokenCount };
}

function renderSourcePage(view) {
  const seedFiles = [
    { title: "website.seed", filePath: seedFile },
    { title: "website.js", filePath: websiteScriptFile },
    { title: "templates/website.css", filePath: path.join(templateDir, "website.css") },
    { title: "templates/website_header_hero.html", filePath: path.join(templateDir, "website_header_hero.html") },
    { title: "templates/website_services.html", filePath: path.join(templateDir, "website_services.html") },
    { title: "templates/website_timeline.html", filePath: path.join(templateDir, "website_timeline.html") },
    { title: "templates/website_showcase.html", filePath: path.join(templateDir, "website_showcase.html") },
    { title: "templates/website_footer.html", filePath: path.join(templateDir, "website_footer.html") }
  ];
  const jsFiles = [
    { title: "website.seed (转译源)", filePath: seedFile },
    { title: "dist/webapp/app.html", filePath: path.join(compiledDir, "app.html") },
    { title: "dist/webapp/app.js", filePath: path.join(compiledDir, "app.js") }
  ];
  const noJsFiles = [
    { title: "website_nojs.seed", filePath: seedNoJsFile },
    { title: "website.js", filePath: path.join(__dirname, "website.js") },
    { title: "templates/website.css", filePath: path.join(templateDir, "website.css") },
    { title: "templates/website_header_hero.html", filePath: path.join(templateDir, "website_header_hero.html") },
    { title: "templates/website_services.html", filePath: path.join(templateDir, "website_services.html") },
    { title: "templates/website_timeline.html", filePath: path.join(templateDir, "website_timeline.html") },
    { title: "templates/website_showcase.html", filePath: path.join(templateDir, "website_showcase.html") },
    { title: "templates/website_footer.html", filePath: path.join(templateDir, "website_footer.html") }
  ];

  let selectedView = "seed";
  if (view === "nojs") {
    selectedView = "nojs";
  } else if (view === "js") {
    selectedView = "js";
  } else if (view === "compare") {
    selectedView = "compare";
  }

  const compareDir = path.join(__dirname, "..", "compare");

  function computeDirTokens(subdir, fileNames) {
    let total = 0;
    for (const fn of fileNames) {
      const fp = path.join(compareDir, subdir, fn);
      if (fs.existsSync(fp)) total += estimateTokenCount(fs.readFileSync(fp, "utf8"));
    }
    return total;
  }

  function readDirFiles(subdir, fileNames) {
    let content = "";
    for (const fn of fileNames) {
      const fp = path.join(compareDir, subdir, fn);
      if (fs.existsSync(fp)) content += "// === " + fn + " ===\n" + fs.readFileSync(fp, "utf8") + "\n\n";
    }
    return content.trim();
  }

  function readDirFilesWithTitles(subdir, fileNames) {
    let content = "";
    for (const fn of fileNames) {
      const fp = path.join(compareDir, subdir, fn);
      if (fs.existsSync(fp)) {
        content += "\n// " + "=".repeat(60) + "\n";
        content += "// 📄 文件: " + fn + "\n";
        content += "// " + "=".repeat(60) + "\n\n";
        content += fs.readFileSync(fp, "utf8") + "\n";
      }
    }
    return content.trim();
  }

  let title = "SEED 交互版源码";
  let sections = renderSourceSections(seedFiles);
  let principleTitle = "SEED 交互版工作原理";
  let principleBody = "SEED 源码先直出页面骨架，再由 website.js 在浏览器端接管动画、事件和动态交互。";
  let displayedFiles = seedFiles;
  let activeSeed = "";
  let activeJs = "";
  let activeNoJs = "";
  let activeCompare = "";

  if (selectedView === "js") {
    title = "JS 转译版源码";
    displayedFiles = jsFiles;
    sections = renderSourceSections(displayedFiles);
    principleTitle = "JS 转译版工作原理";
    principleBody = "SEED 源码先编译为 app.html 与 app.js，浏览器运行编译产物完成页面与交互逻辑。当前页面同时展示 SEED 转译源与 JS 产物。";
    activeJs = "active";
  } else if (selectedView === "nojs") {
    title = "SEED 纯静态版源码";
    displayedFiles = noJsFiles;
    sections = renderSourceSections(displayedFiles);
    principleTitle = "SEED 纯静态版工作原理";
    principleBody = "SEED 源码经 WebRuntime 直接渲染成 HTML/CSS，浏览器只负责展示，不加载前端脚本。";
    activeNoJs = "active";
  } else if (selectedView === "compare") {
    title = "完整网站实现 - TOKEN 效率对比";

    const seedFileList = ["seed_compare.seed", "website.js", "templates/website.css"];
    const nojsFileList = ["seed_compare_nojs.seed", "templates/website.css"];
    const jsFileList = ["server.js", "public/index.html", "public/style.css", "public/app.js"];
    const pythonFileList = ["app.py", "templates/index.html", "static/style.css", "static/app.js"];
    const cppFileList = ["main.cpp", "index.html", "style.css", "app.js"];
    const rustFileList = ["Cargo.toml", "src/main.rs", "static/index.html", "static/style.css", "static/app.js"];

    const seedTokens = computeDirTokens("..", seedFileList);
    const nojsTokens = computeDirTokens("..", nojsFileList);
    const compiledSourceTokens = computeDirTokens("..", ["seed_compare.seed"]);
    let compiledOutputTokens = 0;
    const compiledPaths = [path.join(compiledDir, "app.html"), path.join(compiledDir, "app.js")];
    for (const fp of compiledPaths) { if (fs.existsSync(fp)) compiledOutputTokens += estimateTokenCount(fs.readFileSync(fp, "utf8")); }
    const compiledTokens = compiledSourceTokens + compiledOutputTokens;
    const compiledCode = readDirFilesWithTitles("..", ["seed_compare.seed"]) + "\n\n" + (() => { let c = ""; for (const fp of compiledPaths) if (fs.existsSync(fp)) c += "// === " + path.basename(fp) + " ===\n" + fs.readFileSync(fp, "utf8") + "\n\n"; return c.trim(); })();
    const jsTokens = computeDirTokens("js", jsFileList);
    const pythonTokens = computeDirTokens("python", pythonFileList);
    const cppTokens = computeDirTokens("cpp", cppFileList);
    const rustTokens = computeDirTokens("rust", rustFileList);

    const liveUrls = { nojs: "http://localhost:4173/compare-nojs", seed: "http://localhost:4173/compare-seed", compiled: "http://localhost:4173/compiled-view", js: "http://localhost:3000", python: "http://localhost:5000", cpp: "http://localhost:8080", rust: "http://localhost:9000" };

    principleTitle = "完整网站实现 - TOKEN 效率对比";
    principleBody = "展示 SeedLang 三个版本（纯静态 / 交互版 / JS转译）与四种主流语言实现同一网站所需的 TOKEN 数量。每个版本均可点击预览按钮在线查看实际运行效果。";
    activeCompare = "active";

    const maxTokens = Math.max(nojsTokens, seedTokens, compiledTokens, jsTokens, pythonTokens, cppTokens, rustTokens);
    function pct(t) { return Math.round((t / maxTokens) * 100); }

    const seedCode = readDirFilesWithTitles("..", seedFileList);
    const nojsCode = readDirFilesWithTitles("..", nojsFileList);
    const jsCode = readDirFilesWithTitles("js", jsFileList);
    const pythonCode = readDirFilesWithTitles("python", pythonFileList);
    const cppCode = readDirFilesWithTitles("cpp", cppFileList);
    const rustCode = readDirFilesWithTitles("rust", rustFileList);

    function card(title, tokens, label, color, url, code, badge, adv, dis) {
      return `<div class="compare-item"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px"><div><h3 style="color:${color};margin:0">${title} <b>${tokens}</b> TOKENS <small style="font-weight:400;font-size:11px;color:#98a4d0">${pct(tokens)}%</small></h3><span style="font-size:10px;color:#6b7aa1">${label}</span>${badge ? `<span style="margin-left:6px;font-size:9px;padding:1px 6px;border-radius:4px;background:${color};color:#fff;font-weight:700">${badge}</span>` : ""}</div><a href="${url}" target="_blank" class="liveBtnSm" style="--c:${color}">\u9884\u89c8 \u2197</a></div><div style="background:#1a2744;border-radius:6px;height:10px;margin-bottom:10px;overflow:hidden"><div style="background:${color};height:100%;width:${pct(tokens)}%;border-radius:6px"></div></div>${adv ? `<div style="font-size:10px;color:#8bc484;padding:4px 8px;background:rgba(34,197,94,.06);border-radius:5px;margin-bottom:6px;border-left:2px solid #22c55e">\u2705 ${adv}</div>` : ""}${dis ? `<div style="font-size:10px;color:#e88989;padding:4px 8px;background:rgba(239,68,68,.06);border-radius:5px;margin-bottom:10px;border-left:2px solid #ef4444">\u26a0\ufe0f ${dis}</div>` : ""}<details><summary style="cursor:pointer;color:#9eb0e3;font-size:12px;margin-bottom:6px">\u5c55\u5f00\u6e90\u7801</summary><pre><code>${escapeHtml(code)}</code></pre></details></div>`;
    }

    sections = `<section class="card"><h2>完整网站实现 - TOKEN 效率对比</h2>
<div style="margin-bottom:14px;display:flex;gap:8px;flex-wrap:wrap">
<span style="padding:4px 10px;border-radius:6px;font-size:11px;background:rgba(126,160,255,.12);color:#7ea0ff;border:1px solid rgba(126,160,255,.25)">🔵 SeedLang</span>
<span style="padding:4px 10px;border-radius:6px;font-size:11px;background:rgba(245,158,11,.12);color:#f59e0b;border:1px solid rgba(245,158,11,.25)">🟡 JavaScript</span>
<span style="padding:4px 10px;border-radius:6px;font-size:11px;background:rgba(34,197,94,.12);color:#22c55e;border:1px solid rgba(34,197,94,.25)">🟢 Python</span>
<span style="padding:4px 10px;border-radius:6px;font-size:11px;background:rgba(6,182,212,.12);color:#06b6d4;border:1px solid rgba(6,182,212,.25)">🔵 C++</span>
<span style="padding:4px 10px;border-radius:6px;font-size:11px;background:rgba(236,72,153,.12);color:#ec4899;border:1px solid rgba(236,72,153,.25)">🩷 Rust</span>
</div><p style="font-size:11px;color:#6b7aa1;margin-bottom:14px">⚖️ 所有版本实现完全相同的网站功能（Nav + Hero + Services + Timeline + Showcase + Footer + 动画），公平对比。</p>
<div class="compare-grid" style="grid-template-columns:repeat(auto-fill,minmax(200px,1fr))">
${card("SeedLang 纯SEED版", nojsTokens, "1 源码 · 1 样式", "#7ea0ff", liveUrls.nojs, nojsCode, "最轻量", "零 JS 依赖，纯 HTML+CSS 输出，部署最简单，适合文档站/落地页/博客", "无 JS 动画，动态数据需预嵌入源码")}
${card("SeedLang 交互版", seedTokens, "1 源码 · 1 脚本 · 1 样式", "#5b8def", liveUrls.seed, seedCode, "WebRuntime驱动", "支持动态 API、实时状态、复杂交互、JS 动画，模块化架构可复用", "需 WebRuntime 运行时，部署相对复杂")}
<div class="compare-item"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px"><div><h3 style="color:#4a7fe8;margin:0">SeedLang JS转译 <small style="font-weight:400;font-size:10px;color:#98a4d0">写少部署，自动生成</small></h3><span style="font-size:10px;color:#6b7aa1">1 源码 \u00B7 编译产物 2 文件</span></div><a href="${liveUrls.compiled}" target="_blank" class="liveBtnSm" style="--c:#4a7fe8">预览 ↗</a></div><div style="background:#1a2744;border-radius:6px;padding:10px 12px;margin-bottom:10px"><div style="display:flex;align-items:center;gap:10px;margin-bottom:6px"><span style="font-size:11px;color:#7a8bbd;width:60px">📝 写入量</span><div style="flex:1;background:#0d162e;border-radius:4px;height:8px;overflow:hidden"><div style="background:#4a7fe8;height:100%;width:${Math.round(compiledSourceTokens / maxTokens * 100)}%;border-radius:4px"></div></div><b style="color:#4a7fe8;font-size:14px;margin-left:8px">${compiledSourceTokens}</b></div><div style="display:flex;align-items:center;gap:10px"><span style="font-size:11px;color:#7a8bbd;width:60px">📦 部署物</span><div style="flex:1;background:#0d162e;border-radius:4px;height:8px;overflow:hidden"><div style="background:#6b9bff;height:100%;width:${Math.round(compiledOutputTokens / maxTokens * 100)}%;border-radius:4px"></div></div><b style="color:#6b9bff;font-size:14px;margin-left:8px">${compiledOutputTokens}</b></div></div><div style="font-size:10px;color:#8bc484;padding:4px 8px;background:rgba(34,197,94,.06);border-radius:5px;margin-bottom:6px;border-left:2px solid #22c55e">\u2705 \u5199\u5165\u91cf\u5168\u573a\u6700\u4f4e\uff08\u4ec5 ${compiledSourceTokens} TOKENS\uff09\uff0c\u81ea\u52a8\u751f\u6210\u6807\u51c6 HTML+JS\uff0c\u53ef\u90e8\u7f72 Vercel/Netlify/GitHub Pages</div><div style="font-size:10px;color:#e88989;padding:4px 8px;background:rgba(239,68,68,.06);border-radius:5px;margin-bottom:10px;border-left:2px solid #ef4444">\u26a0\ufe0f \u90e8\u7f72\u7269 TOKEN \u4e0e\u4ed6\u8bed\u8a00\u6301\u5e73\uff0c\u7f16\u8bd1\u4ea7\u7269\u4e0d\u53ef\u7f16\u8f91\uff0c\u8c03\u8bd5\u9700\u56de\u5230 .seed \u6e90\u7801</div><details><summary style="cursor:pointer;color:#9eb0e3;font-size:12px;margin-bottom:6px">展开源码</summary><pre><code>${escapeHtml(compiledCode)}</code></pre></details></div>
${card("JavaScript", jsTokens, "1 服务器 · 1 页面 · 1 样式 · 1 脚本", "#f59e0b", liveUrls.js, jsCode, "生态之王", "npm 生态最成熟，生成工具链完善，前端社区资源丰富，招聘需求量最大", "垃圾回收、异步地狱、npm 依赖爆炸，TypeScript 增加复杂度")}
${card("Python", pythonTokens, "1 服务器 · 1 页面 · 1 样式 · 1 脚本", "#22c55e", liveUrls.python, pythonCode, "AI首选", "语法简洁易读，Flask 轻量框架，上手快速原型开发，AI/Data 领域首选", "性能较弱（GIL 限制），单线程并发不足，部署需 Python 环境")}
${card("C++", cppTokens, "1 服务器 · 1 页面 · 1 样式 · 1 脚本", "#06b6d4", liveUrls.cpp, cppCode, "极致性能", "极致性能优势，内存精确控制，适合高并发/低延迟场景，系统级工程", "开发效率低，内存管理手动，编译慢，学习曲线陡")}
${card("Rust", rustTokens, "1 配置 · 1 服务器 · 1 页面 · 1 样式 · 1 脚本", "#ec4899", liveUrls.rust, rustCode, "内存安全", "内存安全 + 高性能，零成本抽象，编译器级保证错误免疫，WebAssembly 生成", "学习曲线陡，借用检查器难懂，编译慢，Web 生态示例少")}
</div>
<div style="margin-top:16px;padding:14px;border-radius:10px;background:rgba(126,160,255,.06);border:1px solid rgba(126,160,255,.15)">
<h4 style="margin:0 0 8px;color:#9eb0e3;font-size:13px">💡 SeedLang 三版本定位</h4>
<div style="display:flex;gap:12px;flex-wrap:wrap;font-size:11px;color:#98a4d0;line-height:1.6">
<div><b style="color:#7ea0ff">纯静态版</b> — 零 JS 依赖，纯 HTML+CSS 输出，适合文档站/落地页，部署最简单</div>
<div><b style="color:#5b8def">交互版</b> — WebRuntime 驱动，支持动态 API、JS 动画、实时状态、复杂交互</div>
<div><b style="color:#4a7fe8">JS转译版</b> — 写 .seed 源码自动生成 HTML+JS，可部署任意静态托管（Vercel/Netlify/GitHub Pages）</div>
</div></div></section>`;
  } else {
    displayedFiles = seedFiles;
    sections = renderSourceSections(displayedFiles);
    activeSeed = "active";
  }
  const sourceStats = computeSourceStats(displayedFiles);

  let jsSourceTokens = 0, jsOutputTokens = 0;
  if (selectedView === "js") {
    jsSourceTokens = estimateTokenCount(fs.readFileSync(path.join(__dirname, "seed_benchmark.seed"), "utf8"));
    for (const fp of [path.join(compiledDir, "app.html"), path.join(compiledDir, "app.js")]) {
      if (fs.existsSync(fp)) jsOutputTokens += estimateTokenCount(fs.readFileSync(fp, "utf8"));
    }
  }

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>SeedLang Website Source</title>
    <style>
      :root{--bg:#0b1020;--panel:#11182f;--ink:#e8edff;--muted:#98a4d0;--line:#2a365f;--accent:#7ea0ff}
      *{box-sizing:border-box}
      body{margin:0;background:var(--bg);color:var(--ink);font-family:Consolas,Menlo,Monaco,monospace}
      .wrap{max-width:1200px;margin:0 auto;padding:20px}
      .top{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap}
      .top a{color:var(--accent);text-decoration:none}
      .muted{color:var(--muted);margin:8px 0 0}
      .tabs{margin-top:12px;display:flex;gap:8px;flex-wrap:wrap}
      .tab{display:inline-block;padding:8px 12px;border:1px solid var(--line);border-radius:999px;color:var(--ink);text-decoration:none}
      .tab.active{background:#1b2850;border-color:#4f6fc7}
      .principles{margin-top:14px;display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
      .principle{border:1px solid var(--line);border-radius:10px;padding:10px 12px;background:rgba(255,255,255,.03)}
      .principle h3{margin:0 0 6px;font-size:14px}
      .principle p{margin:0;color:var(--muted);font-size:12px;line-height:1.55}
      .stats{margin-top:10px;border:1px solid var(--line);border-radius:10px;padding:10px 12px;background:rgba(255,255,255,.03)}
      .stats b{color:var(--ink)}
      .card{margin-top:16px;border:1px solid var(--line);background:var(--panel);border-radius:12px;overflow:hidden}
      .card h2{margin:0;padding:12px 14px;border-bottom:1px solid var(--line);font-size:15px}
      pre{margin:0;padding:14px;overflow:auto;line-height:1.45;font-size:12px}
      code{white-space:pre}
      @media (max-width: 1100px){.principles{grid-template-columns:1fr}}
      .compare-grid{display:grid;grid-template-columns:repeat(5,1fr);gap:12px;padding:14px}
      .compare-item{border:1px solid var(--line);border-radius:10px;padding:10px 12px;background:rgba(255,255,255,.03)}
      .compare-item h3{font-size:13px}
      .compare-item h3 b{font-size:18px;margin-left:4px}
      .compare-item pre{margin:6px 0 0;padding:0;font-size:11px;line-height:1.4}
      .liveBtnSm{display:inline-flex;align-items:center;padding:3px 9px;border-radius:6px;font-size:11px;font-weight:700;text-decoration:none;color:var(--c);background:rgba(255,255,255,.06);border:1px solid var(--line);transition:all .15s ease}
      .liveBtnSm:hover{background:var(--c);color:#fff}
      @media (max-width: 1100px){.compare-grid{grid-template-columns:1fr 1fr}}
      @media (max-width: 640px){.compare-grid{grid-template-columns:1fr}}
    </style>
  </head>
  <body>
    <div class="wrap">
      <header class="top">
        <h1 style="margin:0;font-size:20px">${title}</h1>
        <a href="/">返回网站主页</a>
      </header>
      <div class="tabs">
        <a class="tab ${activeSeed}" href="/source?view=seed">SEED 交互版源码</a>
        <a class="tab ${activeNoJs}" href="/source?view=nojs">SEED 纯静态版源码</a>
        <a class="tab ${activeJs}" href="/source?view=js">JS 转译版源码</a>
        <a class="tab ${activeCompare}" href="/source?view=compare">TOKEN 效率对比</a>
      </div>
      <section class="principles">
        <article class="principle">
          <h3>${principleTitle}</h3>
          <p>${principleBody}</p>
        </article>
      </section>
      <div class="stats">${selectedView === "js" ? `\ud83d\udcdd \u5199\u5165\u91cf\uff1a<b>${jsSourceTokens}</b> TOKENS &nbsp;|&nbsp; \ud83d\udce6 \u90e8\u7f72\u7269\uff1a<b>${jsOutputTokens}</b> TOKENS &nbsp;|&nbsp; \u5408\u8ba1<b>${sourceStats.tokenCount}</b> TOKENS` : `\u5f53\u524d\u5c55\u793a\u6587\u4ef6\uff1a<b>${sourceStats.fileCount}</b> \u4e2a &nbsp;|&nbsp; \u603b\u4ee3\u7801 Token \u91cf\uff1a<b>${sourceStats.tokenCount}</b>`}</div>
      ${sections}
    </div>
  </body>
</html>`;
}

function renderVersionsPage() {
  const compiledHtmlPath = path.join(compiledDir, "app.html");
  const hasCompiled = fs.existsSync(compiledHtmlPath);
  const rightPane = hasCompiled
    ? '<iframe src="/compiled-view" title="JS Transpiled Site"></iframe>'
    : '<div class="empty">未找到 JS 转译版页面。请先运行 <code>npm run compile:webapp</code> 生成。</div>';

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>SeedLang 双版本展示</title>
    <style>
      :root{--bg:#060b1a;--panel:#101831;--ink:#e7ecff;--muted:#9ba9d8;--line:#28355e;--accent:#7ea0ff}
      *{box-sizing:border-box}
      body{margin:0;background:var(--bg);color:var(--ink);font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif}
      .wrap{max-width:1400px;margin:0 auto;padding:20px}
      .top{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap}
      .top a{color:var(--accent);text-decoration:none}
      .desc{margin:10px 0 0;color:var(--muted)}
      .principles{margin-top:14px;display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
      .principle{border:1px solid var(--line);border-radius:10px;padding:10px 12px;background:rgba(255,255,255,.03)}
      .principle h3{margin:0 0 6px;font-size:14px}
      .principle p{margin:0;color:var(--muted);font-size:12px;line-height:1.55}
      .grid{margin-top:16px;display:grid;grid-template-columns:1fr 1fr;gap:14px}
      .card{border:1px solid var(--line);background:var(--panel);border-radius:12px;overflow:hidden;min-height:70vh}
      .head{padding:10px 12px;border-bottom:1px solid var(--line);font-weight:600}
      .head span{color:var(--muted);font-size:12px;font-weight:400;margin-left:8px}
      iframe{display:block;width:100%;height:calc(70vh - 44px);border:0;background:#fff}
      .empty{padding:14px;color:var(--muted);line-height:1.6}
      @media (max-width: 1100px){.grid,.principles{grid-template-columns:1fr}}
    </style>
  </head>
  <body>
    <div class="wrap">
      <header class="top">
        <h1 style="margin:0;font-size:22px">三版本对比总览</h1>
        <div style="display:flex;gap:12px;flex-wrap:wrap">
          <a href="/seed-no-js">打开 SEED 纯静态版</a>
          <a href="/seed">打开 SEED 交互版</a>
          <a href="/compiled-view">打开 JS 转译版</a>
          <a href="/">返回主页</a>
        </div>
      </header>
      <p class="desc">统一命名：SEED 纯静态版（无JS）、SEED 交互版（含JS）、JS 转译版。</p>
      <section class="principles">
        <article class="principle">
          <h3>SEED 纯静态版工作原理</h3>
          <p>SEED 源码经 WebRuntime 直接渲染成 HTML/CSS，浏览器只负责展示，不加载前端脚本。</p>
        </article>
        <article class="principle">
          <h3>SEED 交互版工作原理</h3>
          <p>SEED 源码先直出页面骨架，再由 website.js 在浏览器端接管动画、事件和动态交互。</p>
        </article>
        <article class="principle">
          <h3>JS 转译版工作原理</h3>
          <p>SEED 源码先编译为 app.html 与 app.js，浏览器运行编译产物完成页面与交互逻辑。</p>
        </article>
      </section>
      <section class="grid">
        <article class="card">
          <div class="head">SEED 纯静态版<span>/seed-no-js</span></div>
          <iframe src="/seed-no-js" title="Seed Native Site No JS"></iframe>
        </article>
        <article class="card">
          <div class="head">JS 转译版<span>/compiled-view</span></div>
          ${rightPane}
        </article>
      </section>
    </div>
  </body>
</html>`;
}

const server = http.createServer(async (req, res) => {
  const reqUrl = new URL(req.url || "/", `http://localhost:${port}`);
  const pathname = reqUrl.pathname;

  if (req.url === "/health") {
    sendJson(res, 200, { ok: true });
    return;
  }

  if (pathname === "/api/state" && req.method === "GET") {
    sendJson(res, 200, {
      counter: state.counter,
      visits: state.visits,
      todoCount: state.todos.length,
      serverTime: new Date().toISOString()
    });
    return;
  }

  if (pathname === "/api/todos" && req.method === "GET") {
    sendJson(res, 200, { todos: state.todos });
    return;
  }

  if (pathname === "/api/todos" && req.method === "POST") {
    try {
      const body = await readJsonBody(req);
      const text = String(body.text || "").trim();
      if (!text) {
        sendJson(res, 400, { ok: false, error: "Todo text is required." });
        return;
      }
      const todo = { id: state.nextTodoId, text, done: false };
      state.nextTodoId += 1;
      state.todos.push(todo);
      sendJson(res, 201, { ok: true, todo, todos: state.todos });
    } catch (err) {
      sendJson(res, 400, { ok: false, error: err.message });
    }
    return;
  }

  if (pathname.startsWith("/api/todos/") && req.method === "DELETE") {
    const id = Number(pathname.split("/").pop());
    if (!Number.isFinite(id)) {
      sendJson(res, 400, { ok: false, error: "Invalid todo id." });
      return;
    }
    state.todos = state.todos.filter((item) => item.id !== id);
    sendJson(res, 200, { ok: true, todos: state.todos });
    return;
  }

  if (pathname.startsWith("/api/todos/") && pathname.endsWith("/toggle") && req.method === "POST") {
    const parts = pathname.split("/");
    const id = Number(parts[parts.length - 2]);
    if (!Number.isFinite(id)) {
      sendJson(res, 400, { ok: false, error: "Invalid todo id." });
      return;
    }
    const target = state.todos.find((item) => item.id === id);
    if (!target) {
      sendJson(res, 404, { ok: false, error: "Todo not found." });
      return;
    }
    target.done = !target.done;
    sendJson(res, 200, { ok: true, todo: target, todos: state.todos });
    return;
  }

  if (pathname === "/api/counter/increment" && req.method === "POST") {
    state.counter += 1;
    sendJson(res, 200, { ok: true, counter: state.counter });
    return;
  }

  if (pathname === "/api/counter/decrement" && req.method === "POST") {
    state.counter -= 1;
    sendJson(res, 200, { ok: true, counter: state.counter });
    return;
  }

  if (pathname === "/api/counter/reset" && req.method === "POST") {
    state.counter = 0;
    sendJson(res, 200, { ok: true, counter: state.counter });
    return;
  }

  if ((pathname === "/compiled" || pathname === "/compiled/") && req.method === "GET") {
    const filePath = path.join(compiledDir, "app.html");
    if (!fs.existsSync(filePath)) {
      sendJson(res, 404, { ok: false, error: "Compiled app.html not found. Run npm run compile:webapp first." });
      return;
    }
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(fs.readFileSync(filePath, "utf8"));
    return;
  }

  if ((pathname === "/compiled-view" || pathname === "/compiled-view/") && req.method === "GET") {
    const filePath = path.join(compiledDir, "app.html");
    if (!fs.existsSync(filePath)) {
      sendJson(res, 404, { ok: false, error: "Compiled app.html not found. Run npm run compile:webapp first." });
      return;
    }
    const rawHtml = fs.readFileSync(filePath, "utf8");
    let markedHtml = injectVersionBadge(rawHtml, "JS 转译版", "#7a5cff");
    // In transpiled view, source button should jump directly to transpiled JS source view.
    markedHtml = markedHtml.replace(/href="\/source(?:\?view=[^"]*)?"/g, 'href="/source?view=js"');
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(markedHtml);
    return;
  }

  if ((pathname === "/versions" || pathname === "/versions/") && req.method === "GET") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(renderVersionsPage());
    return;
  }

  if ((pathname === "/seed" || pathname === "/seed/") && req.method === "GET") {
    try {
      state.visits += 1;
      const html = renderSeedToHtml(seedFile);
      const markedHtml = injectVersionBadge(html, "SeedLang 交互版", "#2f7cff");
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(markedHtml);
    } catch (err) {
      res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
      res.end(`Render Error: ${err.message}`);
    }
    return;
  }

  if ((pathname === "/seed-no-js" || pathname === "/seed-no-js/") && req.method === "GET") {
    try {
      state.visits += 1;
      const html = renderSeedToHtml(seedNoJsFile);
      const markedHtml = injectVersionBadge(html, "SeedLang 纯SEED版", "#1f9d66");
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(markedHtml);
    } catch (err) {
      res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
      res.end(`Render Error: ${err.message}`);
    }
    return;
  }

  if ((pathname === "/compare-seed" || pathname === "/compare-seed/") && req.method === "GET") {
    try {
      state.visits += 1;
      const html = renderSeedToHtml(seedCompareFile);
      const markedHtml = injectVersionBadge(html, "SeedLang 交互版 (对比)", "#2f7cff");
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(markedHtml);
    } catch (err) {
      res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
      res.end(`Render Error: ${err.message}`);
    }
    return;
  }

  if ((pathname === "/compare-nojs" || pathname === "/compare-nojs/") && req.method === "GET") {
    try {
      state.visits += 1;
      const html = renderSeedToHtml(seedCompareNoJsFile);
      const markedHtml = injectVersionBadge(html, "SeedLang 纯SEED版 (对比)", "#1f9d66");
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(markedHtml);
    } catch (err) {
      res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
      res.end(`Render Error: ${err.message}`);
    }
    return;
  }

  if ((pathname === "/compiled/app.js" || pathname === "/app.js") && req.method === "GET") {
    const filePath = path.join(compiledDir, "app.js");
    if (!fs.existsSync(filePath)) {
      sendJson(res, 404, { ok: false, error: "Compiled app.js not found. Run npm run compile:webapp first." });
      return;
    }
    res.writeHead(200, { "Content-Type": "application/javascript; charset=utf-8" });
    res.end(fs.readFileSync(filePath, "utf8"));
    return;
  }

  if (pathname === "/games_logic.js" && req.method === "GET") {
    if (!fs.existsSync(gamesLogicFile)) {
      sendJson(res, 404, { ok: false, error: "games_logic.js not found." });
      return;
    }
    res.writeHead(200, { "Content-Type": "application/javascript; charset=utf-8" });
    res.end(fs.readFileSync(gamesLogicFile, "utf8"));
    return;
  }

  if (pathname === "/games.js" && req.method === "GET") {
    if (!fs.existsSync(gamesScriptFile)) {
      sendJson(res, 404, { ok: false, error: "games.js not found." });
      return;
    }
    res.writeHead(200, { "Content-Type": "application/javascript; charset=utf-8" });
    res.end(fs.readFileSync(gamesScriptFile, "utf8"));
    return;
  }

  if (pathname === "/website.js" && req.method === "GET") {
    if (!fs.existsSync(websiteScriptFile)) {
      sendJson(res, 404, { ok: false, error: "website.js not found." });
      return;
    }
    res.writeHead(200, { "Content-Type": "application/javascript; charset=utf-8" });
    res.end(fs.readFileSync(websiteScriptFile, "utf8"));
    return;
  }

  if (pathname === "/source" && req.method === "GET") {
    const sourceView = reqUrl.searchParams.get("view");
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(renderSourcePage(sourceView));
    return;
  }

  if (pathname.startsWith("/api/")) {
    sendJson(res, 404, { ok: false, error: "API route not found." });
    return;
  }

  try {
    state.visits += 1;
    const targetSeed = pathname === "/games" ? gamesSeedFile : seedFile;
    const html = renderSeedToHtml(targetSeed);
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(html);
  } catch (err) {
    res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
    res.end(`Render Error: ${err.message}`);
  }
});

server.listen(port, () => {
  console.log(`Seed website server running at http://localhost:${port}`);
  console.log(`Seed source: ${seedFile}`);
});
