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
## EXP-003：Git 未验收基线导入与文件卫生

- 日期：2026-11-03（Asia/Shanghai）；关联 ADR-008。
- 方法：初始化 chore/repository-baseline，抓取 origin/main（459e0b2），显式暂存 28 个本地文件；检查 git diff --cached --name-only、git diff --cached --check、禁入路径和常见密钥格式；本地提交 eb0b66e，再合并远程 main 为 e401b01。
- 观察：合并后远程 main 是本地分支祖先；README.md 保留；跟踪文件 29 个、禁入路径 0。两次 HTTPS 推送分别遇到连接重置及 443 端口不可达，尚无推送成功证据。
- 结论：本地基线和远程历史合并完成；远程分支发布未通过，不能称为“Git 对接完成”。

## EXP-004：方案文档一致性与 S1 原型回归

- 日期：2026-11-03（Asia/Shanghai）；关联 R-01、R-05、R-06、R-13 至 R-15。
- 环境：Node.js 24.19.0；当前独立分支。
- 方法：检查需求编号和 Markdown 文件引用；运行 git diff --check；用 Node 24 执行 apps/api/tests/api.test.mjs、Vue 类型检查和 Vite build。
- 观察：需求编号 15 个、重复 0；Markdown 引用缺失 0；差异空白检查退出码 0；API 测试 3/3 通过；类型检查退出码 0；Vite 构建退出码 0。
- 限制：这些检查只覆盖已有 S1 演示原型与文档格式；没有暗水印编解码、原图样本或社交平台链路实验。R-13 至 R-15 均未验收。
- 结论：已有原型的局部回归通过，技术方案仍待用户审阅。

## EXP-005：远程基线分支复核

- 日期：2026-11-03（Asia/Shanghai）；关联阶段：Git 基线接入。
- 方法：执行 `git ls-remote --heads origin chore/repository-baseline`、`git rev-parse HEAD`、`git rev-parse refs/remotes/origin/chore/repository-baseline` 和 `git status --porcelain=v1`。
- 观察：远程分支、本地 HEAD、本地远程跟踪引用均为 `8ee14c0b87d437b402297308183f9759250261cb`；工作区无未提交文件。此前推送失败的记录保留为历史，不再代表当前远程状态。
- 结论：远程基线分支已创建且与本次核对时的本地提交一致；该结论不代表后续提交自动推送成功。

## EXP-006：技术方案口径复核

- 日期：2026-11-03（Asia/Shanghai）；关联 R-12、R-14、R-15。
- 方法：核对 T3/T4 分层格子及最小样本数；使用 `rg -o` 检查需求编号，使用 `rg -n` 检查三份方案文档的结果字段与术语，并执行 `git diff --check`。
- 观察：需求编号 R-01 至 R-15 各出现一次；T3 完整图与 T4 裁剪图各 8 格、每格至少 200 张，合计至少 3200 张；接口与研究方案均规定 `detectionScore` 和仅在校准后提供的可选 `confidence`；空白检查退出码 0。
- 结论：本轮文档口径一致性检查通过；没有暗水印实现或真实链路成功率证据。

## EXP-007：目标系统接入方案文档复核

- 日期：2026-11-03（Asia/Shanghai）；关联 R-02、R-04、R-09、R-16。
- 输入：用户提供的管理系统截图及“暂时无法提供源码，只做可接入 SDK”的说明。截图只用于观察界面结构，文件和真实业务内容未复制入仓库。
- 方法：新增文字接入设计后，用 `rg --files -g '*.md'` 枚举 Markdown；检查本地 Markdown 链接、R-xx 编号和 `git diff --check`。首次脚本因仓库根目录文件的父路径为空而停止；修正路径解析后重跑。
- 观察：Markdown 文件 13 个；本地链接 10 个、缺失 0；需求 R-01 至 R-16 共 16 个、重复 0；差异空白检查退出码 0。
- 结论：设计文档结构检查通过。没有访问实际业务系统源码，R-16 及暗水印功能验收均未运行。

## EXP-008：初期存储方案文档核对

- 日期：2026-11-04（Asia/Shanghai）；关联 R-05、R-08、R-14、R-15。
- 输入：用户询问项目初期数据存放位置及是否必须有数据库；当前 `apps/api/server.mjs` 使用内存 `Map` 与数组，生产启动保护明确禁止演示身份和内存审计。
- 方法：只读核对原型与设计文档中的存储表述；提出 ADR-012 分阶段存储方案；检查 16 个需求编号、本地 Markdown 链接与 `git diff --check`。
- 观察：Markdown 文件 13 个、本地链接 10 个、缺失 0；需求编号 16 个、重复 0；差异空白检查退出码 0。未创建数据库或修改功能代码。
- 结论：文档一致性检查通过。SQLite 仍为待审的单机研究环境建议；持久化与备份恢复尚未实现或测试。

## EXP-009：本地重启持久化方案文档复核

- 日期：2026-11-04（Asia/Shanghai）；关联 R-08、R-14、ADR-013。
- 输入：用户指出水印服务可能自行重启，希望初期使用简单的本地持久化。ADR-012 延后持久化的提案因此被取代。
- 方法：新增 LOCAL_STORAGE_PLAN.md，核对架构、需求、里程碑和实验门槛；检查本地 Markdown 链接、需求编号、`git check-ignore` 对数据库主文件及侧文件的规则，并执行 `git diff --check`。
- 观察：Markdown 文件 14 个、本地链接 11 个、缺失 0；需求编号 16 个、重复 0；四个数据库文件路径均被忽略；差异空白检查退出码 0。
- 结论：文档与仓库忽略规则检查通过。SQLite 尚未安装或接入，重启恢复、事务和备份仍是待实现验收项。
