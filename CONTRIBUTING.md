# 贡献指南 / Contributing Guide

感谢你对 SeedLang 的兴趣！欢迎各种形式的贡献：Bug 报告、特性建议、文档改进、代码贡献。

参与前请阅读 [行为准则](CODE_OF_CONDUCT.md)。**安全相关**问题请勿公开开 Issue，请按 [SECURITY.md](SECURITY.md) 私下报告。

## 开发环境

```bash
git clone https://github.com/seedlang-team/seedlang.git
cd seedlang
npm install
npm run build
```

## 开发流程

1. Fork 仓库，创建特性分支
   ```bash
   git checkout -b feature/your-feature
   ```
2. 编写代码和测试
3. 运行全量测试确保通过
   ```bash
   npm test
   ```
4. 运行性能基准确保无退化
   ```bash
   node bench/run.js
   ```
5. 提交 Pull Request

## 代码风格

- TypeScript 严格模式，遵循 `tsconfig.json` 配置
- Seed 代码遵循 [语言规范](docs/LANGUAGE_SPEC_REFACTOR_DRAFT.md)
- 无逗号、无分号、空格分隔参数

## 提交信息规范

```
<type>: <description>

type: feat / fix / docs / refactor / test / bench / chore
```

示例：
```
feat: add C-style for(;;) loop support
fix: gKeywordsMap shadow variable in initKeywords
```

## Bug 报告

请提供：
- SeedLang 版本 (`seedlang --version`)
- Node.js 版本
- 最小复现代码

## License

贡献即表示你同意将代码以 MIT 协议发布。