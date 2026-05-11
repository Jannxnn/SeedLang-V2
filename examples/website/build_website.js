const fs = require("fs");
const path = require("path");
const { WebRuntime } = require("../../dist/index.js");

const seedFile = path.join(__dirname, "website.seed");
const outDir = path.join(__dirname, "..", "..", "dist", "site");
const outFile = path.join(outDir, "index.html");

function renderSeedToHtml() {
  const source = fs.readFileSync(seedFile, "utf8");
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

function build() {
  const html = renderSeedToHtml();
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(outFile, html, "utf8");
  console.log(`Built: ${outFile}`);
}

build();
