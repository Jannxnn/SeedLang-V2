#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { WebRuntime } = require("../dist/index.js");
const { parse } = require("../dist/core/parser.js");

function usage() {
  console.log("Seed Web Compiler");
  console.log("");
  console.log("Usage:");
  console.log("  node tools/seed-web-compile.js <input.seed> [outDir]");
  console.log("");
  console.log("Example:");
  console.log("  node tools/seed-web-compile.js path/to/page.seed dist/webapp");
}

function renderSeedToHtml(seedPath) {
  const source = fs.readFileSync(seedPath, "utf8");
  const runtime = new WebRuntime();
  const results = runtime.runWeb(source);

  for (let i = results.length - 1; i >= 0; i -= 1) {
    const value = results[i];
    if (value && value.type === "string" && typeof value.value === "string" && value.value.includes("<html")) {
      return value.value;
    }
  }

  throw new Error("Seed render failed: no HTML string result found.");
}

function literalArg(node) {
  if (!node || typeof node !== "object") return null;
  if (node.type === "Identifier") return node.name;
  if (node.type === "TextLiteral") return node.value;
  if (node.type === "NumberLiteral") return String(node.value);
  if (node.type === "BooleanLiteral") return String(node.value);
  return null;
}

function namedArgValue(stmt, key) {
  if (!stmt || !Array.isArray(stmt.namedArgs)) return null;
  for (const item of stmt.namedArgs) {
    if (!item || item.key !== key) continue;
    return literalArg(item.value);
  }
  return null;
}

function parseWebDirectives(sourceCode) {
  const config = {
    binds: ["counter", "visits", "serverTime", "error"],
    listKey: "todos",
    fetchStateUrl: "/api/state",
    fetchTodosUrl: "/api/todos",
    enterBindings: []
  };

  const ast = parse(sourceCode);
  const directives = [];

  function collectWebDirectives(statements) {
    if (!Array.isArray(statements)) return;
    for (const stmt of statements) {
      if (!stmt || typeof stmt !== "object") continue;
      if (stmt.type === "WebDirective") {
        directives.push(stmt);
        continue;
      }
      if (stmt.type === "WebDirectiveBlock" && Array.isArray(stmt.directives)) {
        for (const directive of stmt.directives) {
          if (directive && directive.type === "WebDirective") {
            directives.push(directive);
          }
        }
        continue;
      }
      if (stmt.type === "Block" && Array.isArray(stmt.statements)) {
        collectWebDirectives(stmt.statements);
      }
    }
  }

  collectWebDirectives(ast.statements || []);
  for (const stmt of directives) {
    if (!stmt || stmt.type !== "WebDirective") continue;
    if (stmt.namespace !== "web") continue;

    const args = (stmt.args || []).map(literalArg).filter((v) => typeof v === "string");
    const directive = stmt.name;

    if (directive === "bind") {
      const bindName = namedArgValue(stmt, "key") || namedArgValue(stmt, "name") || args[0];
      if (bindName && !config.binds.includes(bindName)) {
        config.binds.push(bindName);
      }
      continue;
    }

    if (directive === "list") {
      const listName = namedArgValue(stmt, "key") || namedArgValue(stmt, "name") || args[0];
      if (listName) config.listKey = listName;
      continue;
    }

    if (directive === "fetchState") {
      const stateUrl = namedArgValue(stmt, "url") || args[0];
      if (stateUrl) config.fetchStateUrl = stateUrl;
      continue;
    }

    if (directive === "fetchList") {
      const listUrl = namedArgValue(stmt, "url") || args[0];
      if (listUrl) config.fetchTodosUrl = listUrl;
      continue;
    }

    if (directive === "enter") {
      const inputId = namedArgValue(stmt, "input") || namedArgValue(stmt, "inputId") || args[0];
      const action = namedArgValue(stmt, "action") || args[1];
      if (inputId && action) {
        config.enterBindings.push({ inputId, action });
      }
    }
  }

  return config;
}

function injectRuntimeScriptTag(html) {
  if (html.includes('src="/compiled/app.js"')) {
    return html;
  }
  if (html.includes("</body>")) {
    return html.replace("</body>", '  <script src="/compiled/app.js"></script>\n</body>');
  }
  return `${html}\n<script src="/compiled/app.js"></script>\n`;
}

function clientRuntimeSource(config) {
  return `"use strict";
(function () {
  const config = ${JSON.stringify(config)};
  const state = {
    counter: 0,
    visits: 0,
    todos: [],
    serverTime: "-",
    error: ""
  };

  function byId(id) {
    return document.getElementById(id);
  }

  function toText(value) {
    if (value === null || value === undefined) return "";
    return String(value);
  }

  function setTextByBind(key, value) {
    const nodes = document.querySelectorAll('[data-bind="' + key + '"]');
    nodes.forEach((node) => {
      node.textContent = toText(value);
    });
  }

  function renderTodoList() {
    const listNodes = document.querySelectorAll('[data-list="' + config.listKey + '"]');
    listNodes.forEach((listNode) => {
      listNode.innerHTML = "";
      if (!Array.isArray(state.todos) || state.todos.length === 0) {
        const emptyText = listNode.getAttribute("data-empty") || "No todos";
        const li = document.createElement("li");
        li.textContent = emptyText;
        listNode.appendChild(li);
        return;
      }
      state.todos.forEach((todo) => {
        const li = document.createElement("li");
        li.style.margin = "6px 0";
        li.style.opacity = todo.done ? "0.7" : "1";
        const label = document.createElement("span");
        label.textContent = todo.done ? ("[Done] " + todo.text) : todo.text;
        if (todo.done) {
          label.style.textDecoration = "line-through";
        }
        li.appendChild(label);
        li.appendChild(document.createTextNode(" "));
        const done = document.createElement("button");
        done.textContent = todo.done ? "Undo" : "Done";
        done.setAttribute("data-action", "toggleTodo");
        done.setAttribute("data-id", String(todo.id));
        done.style.marginLeft = "8px";
        li.appendChild(done);
        const del = document.createElement("button");
        del.textContent = "Delete";
        del.setAttribute("data-action", "removeTodo");
        del.setAttribute("data-id", String(todo.id));
        del.style.marginLeft = "8px";
        li.appendChild(del);
        listNode.appendChild(li);
      });
    });
  }

  function render() {
    config.binds.forEach((key) => {
      setTextByBind(key, state[key]);
    });
    renderTodoList();
  }

  function setError(message) {
    state.error = message ? String(message) : "";
    render();
  }

  async function requestJson(url, options) {
    const res = await fetch(url, options);
    if (!res.ok) {
      throw new Error("HTTP " + res.status);
    }
    return res.json();
  }

  async function refreshFromServer() {
    const s = await requestJson(config.fetchStateUrl);
    state.counter = s.counter;
    state.visits = s.visits;
    state.serverTime = s.serverTime;
    const todosResult = await requestJson(config.fetchTodosUrl);
    state.todos = todosResult.todos || [];
    state.error = "";
    render();
  }

  async function runAction(action, node) {
    if (action === "increment") {
      const data = await requestJson("/api/counter/increment", { method: "POST" });
      state.counter = data.counter;
      render();
      return;
    }
    if (action === "decrement") {
      const data = await requestJson("/api/counter/decrement", { method: "POST" });
      state.counter = data.counter;
      render();
      return;
    }
    if (action === "reset") {
      const data = await requestJson("/api/counter/reset", { method: "POST" });
      state.counter = data.counter;
      render();
      return;
    }
    if (action === "addTodo") {
      const inputId = node.getAttribute("data-input");
      const input = inputId ? byId(inputId) : null;
      const text = input ? input.value.trim() : "";
      if (!text) return;
      const data = await requestJson("/api/todos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: text })
      });
      state.todos = data.todos || [];
      if (input) input.value = "";
      render();
      return;
    }
    if (action === "removeTodo") {
      const id = node.getAttribute("data-id");
      if (!id) return;
      const data = await requestJson("/api/todos/" + encodeURIComponent(id), { method: "DELETE" });
      state.todos = data.todos || [];
      render();
      return;
    }
    if (action === "toggleTodo") {
      const id = node.getAttribute("data-id");
      if (!id) return;
      const data = await requestJson("/api/todos/" + encodeURIComponent(id) + "/toggle", { method: "POST" });
      state.todos = data.todos || [];
      render();
      return;
    }
    if (action === "refresh") {
      await refreshFromServer();
    }
  }

  document.addEventListener("click", async (event) => {
    const node = event.target.closest("[data-action]");
    if (!node) return;
    const action = node.getAttribute("data-action");
    if (!action) return;
    try {
      await runAction(action, node);
    } catch (err) {
      console.error("Action failed:", err);
      setError(err && err.message ? err.message : "Unknown action error");
    }
  });

  document.addEventListener("keydown", async (event) => {
    if (event.key !== "Enter") return;
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    const bindInput = target.getAttribute("id") || "";
    for (const item of config.enterBindings) {
      if (item.inputId !== bindInput) continue;
      const btn = document.querySelector('[data-action="' + item.action + '"][data-input="' + bindInput + '"]');
      if (!btn) continue;
      try {
        await runAction(item.action, btn);
      } catch (err) {
        setError(err && err.message ? err.message : "Unknown input error");
      }
      break;
    }
  });

  refreshFromServer().catch((err) => {
    console.error("Initial refresh failed:", err);
    setError(err && err.message ? err.message : "Failed to initialize");
  });
})();`;
}

function main() {
  const input = process.argv[2];
  const outDirArg = process.argv[3];
  if (!input) {
    usage();
    process.exit(1);
  }

  const inputPath = path.resolve(process.cwd(), input);
  if (!fs.existsSync(inputPath)) {
    throw new Error(`Input file not found: ${inputPath}`);
  }

  const outDir = outDirArg
    ? path.resolve(process.cwd(), outDirArg)
    : path.resolve(process.cwd(), "dist", "webapp");
  const htmlPath = path.join(outDir, "app.html");
  const jsPath = path.join(outDir, "app.js");

  const sourceCode = fs.readFileSync(inputPath, "utf8");
  const directives = parseWebDirectives(sourceCode);
  const rawHtml = renderSeedToHtml(inputPath);
  const finalHtml = injectRuntimeScriptTag(rawHtml);
  const runtimeJs = clientRuntimeSource(directives);

  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(htmlPath, finalHtml, "utf8");
  fs.writeFileSync(jsPath, runtimeJs, "utf8");

  console.log(`Compiled seed web app from: ${inputPath}`);
  console.log(`Wrote HTML: ${htmlPath}`);
  console.log(`Wrote JS:   ${jsPath}`);
}

main();
