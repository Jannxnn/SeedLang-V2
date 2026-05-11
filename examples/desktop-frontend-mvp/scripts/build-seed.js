const fs = require('fs');
const path = require('path');

const outDir = path.join(__dirname, '..', 'dist');
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

const outFile = path.join(outDir, 'seed-logic.js');
const content = `// Placeholder generated artifact.\nmodule.exports = { title: "SeedLang Desktop Frontend MVP" };\n`;
fs.writeFileSync(outFile, content, 'utf-8');

console.log(`[build:seed] generated ${outFile}`);

