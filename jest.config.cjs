module.exports = {
  roots: ['<rootDir>/tests'],
  modulePathIgnorePatterns: ['<rootDir>/editors/vscode'],
  testPathIgnorePatterns: ['<rootDir>/node_modules/', '<rootDir>/dist/'],
  passWithNoTests: true,
};
