#!/usr/bin/env node
/**
 * 在默认浏览器中打开稳定性交付物的静态预览页（Windows: start；macOS: open；Linux: xdg-open）。
 * 用法: node tools/open-stability-preview.js
 */
const path = require("path");
const { spawn } = require("child_process");

const html = path.resolve(
  __dirname,
  "..",
  "examples",
  "deliverables",
  "stability-check",
  "web",
  "index.html"
);

const fs = require("fs");
if (!fs.existsSync(html)) {
  console.error("Missing file:", html);
  process.exit(1);
}

const fileUrl = "file:///" + html.replace(/\\/g, "/");

if (process.platform === "win32") {
  spawn("cmd", ["/c", "start", "", fileUrl], { detached: true, stdio: "ignore" }).unref();
} else if (process.platform === "darwin") {
  spawn("open", [fileUrl], { detached: true, stdio: "ignore" }).unref();
} else {
  spawn("xdg-open", [fileUrl], { detached: true, stdio: "ignore" }).unref();
}

console.log("Opening in browser:", fileUrl);
