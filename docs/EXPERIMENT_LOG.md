# 实验记录

本文件只记录已经执行的实验。准备中的测试写在需求或任务计划中，不伪装成结果。

## EXP-000：初始工作区检查

- 日期：2026-11-02（Asia/Shanghai）
- 目的：确认是否存在已有工程和约束文件。
- 环境：PowerShell，工作目录 `D:\Code\watermarkNew`。
- 命令：`Get-ChildItem -Force`、`Test-Path AGENTS.md`、`Test-Path docs`、`git status --short`。
- 观察：目录无文件；两个路径均返回 `False`；`git status` 提示当前目录不是 Git 仓库。
- 结论：文档和工程均需从零建立；本条不涉及功能正确性。

## EXP-001：规范文档一致性检查

- 日期：2026-11-02（Asia/Shanghai）
- 关联阶段：S0。
- 目的：检查文档齐备、需求编号不重复、交叉引用文件存在。
- 环境：PowerShell，工作目录 `D:\Code\watermarkNew`。
- 方法：对 8 个目标文件执行 `Test-Path`；用正则提取 `REQUIREMENTS.md` 的 `R-xx` 编号并分组查重；提取全文中的 `docs/*.md` 引用并逐一检查存在性。
- 原始结果：`Files: 8/8; Requirements: 12; Duplicate IDs: 0; Missing refs: 0`；命令退出码 `0`。
- 结论：本轮文档结构检查通过。该检查不证明架构或功能已验证。

## EXP-002：S1 原型初步静态与接口检查

- 日期：2026-11-03（Asia/Shanghai）。
- 关联需求：R-01、R-05、R-06；仅为局部验证。
- 环境：工作区 Node 24.19.0；pnpm 11.25.0；Vue 3/Vite 依赖由 `pnpm-lock.yaml` 固定。
- 方法：直接运行 Node 24 的 `--test apps/api/tests/api.test.mjs`；在 `apps/web` 运行 `vue-tsc --noEmit -p tsconfig.json` 与 `vite build --configLoader native`。
- 原始结果：API 3 项通过、0 失败；类型检查退出码 0；Vite 构建通过，生成 `dist/index.html`、CSS 和 JS 资源。
- 限制：未完成浏览器交互、截图覆盖、打印、性能、真实身份系统、持久化审计或生产安全验收。Vite 开发服务写缓存时被沙箱拒绝，后续提权请求被拒绝，未继续该验证。
- 结论：局部检查通过；不能认定 S1 或上线标准已达成。用户指出实施早于方案审阅，代码开发已暂停。

后续实验从 `EXP-003` 开始。
