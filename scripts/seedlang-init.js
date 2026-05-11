#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const projectName = process.argv[2] || 'my-seedlang-project';

const currentDir = process.cwd();
const projectDir = path.join(currentDir, projectName);

if (fs.existsSync(projectDir)) {
    console.log(`Error: Directory "${projectName}" already exists.`);
    process.exit(1);
}

console.log(`Creating SeedLang project: ${projectName}`);
console.log('');

fs.mkdirSync(projectDir, { recursive: true });
fs.mkdirSync(path.join(projectDir, 'src'));
fs.mkdirSync(path.join(projectDir, 'examples'));

const packageJson = {
    name: projectName,
    version: "1.0.0",
    description: "SeedLang project",
    scripts: {
        start: "seedlang src/main.seed",
        build: "seedlang --compile src/main.seed -o dist/main.js"
    }
};

fs.writeFileSync(
    path.join(projectDir, 'package.json'),
    JSON.stringify(packageJson, null, 2)
);

const mainSeed = `// ${projectName}
// SeedLang Project

print("Hello from ${projectName}!")

// Add your code here
`;

fs.writeFileSync(path.join(projectDir, 'src', 'main.seed'), mainSeed);

const readme = `# ${projectName}

SeedLang Project

## Usage

\`\`\`bash
# Run
seedlang src/main.seed

# Or use npm
npm start
\`\`\`

## Structure

\`\`\`
${projectName}/
├── src/
│   └── main.seed
├── examples/
└── package.json
\`\`\`
`;

fs.writeFileSync(path.join(projectDir, 'README.md'), readme);

const gitignore = `node_modules/
dist/
*.log
.seedlang_db
`;

fs.writeFileSync(path.join(projectDir, '.gitignore'), gitignore);

console.log('Project created successfully!');
console.log('');
console.log('Next steps:');
console.log(`  cd ${projectName}`);
console.log('  seedlang src/main.seed');
console.log('');
