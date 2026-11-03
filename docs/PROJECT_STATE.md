# 项目状态

更新日期：2026-11-03（Asia/Shanghai）
阶段：Git 基线接入与技术方案审阅；功能代码开发暂停

## 当前事实

- 用户确定顺序：先接入 Git 仓库，再审阅并敲定明暗水印技术方案，之后才继续功能开发。
- 本地 chore/repository-baseline 已有未验收 S1 原型提交 eb0b66e，合并远程 main 历史的提交 e401b01；origin/main 原提交 459e0b2 是本地分支祖先。远程 main 未被修改。
- Git 首次推送曾遇到连接重置和 GitHub 443 端口暂时不可达；2026-11-03 重新核对 `git ls-remote --heads origin chore/repository-baseline`，远程分支为 `8ee14c0b87d437b402297308183f9759250261cb`，与当时本地 HEAD 一致。Git 基线分支已接入，远程 `main` 未修改。后续提交仍需逐次核对远程 SHA。
- 当前代码只实现演示身份、可见水印和手工可见码核验。暗水印编码、图片提取、持久化审计及 A→B→C 双次非原图转发识别均未实现。
- docs/assets/watermark-traceability-architecture.png 是早期单次转发示意图；精确的 A→B→C 目标链路以 ARCHITECTURE.md 中的新 Mermaid 图为准，旧 PNG 待方案确认后重绘。

## 本轮文档交付

- WATERMARK_RESEARCH_PLAN.md：明暗水印候选编码、绘制、提取、接口和安全边界；状态为待用户审阅。
- BENCHMARK_PROTOCOL.md：T0–T4 分层、原图硬门槛、真实双次转发矩阵、负样本和防回退规则；所有阈值均为目标，尚无暗水印实测结果。
- 已同步 REQUIREMENTS.md、ARCHITECTURE.md、API_CONTRACT.md、PROJECT_PLAN.md、DEVELOPMENT_WORKFLOW.md、DECISIONS.md、AGENTS.md 和 README.md。没有编写或修改新功能代码。

## 实际验证证据

| 项目 | 结果 | 证据 |
| --- | --- | --- |
| Git 基线文件审计 | 本地通过 | EXP-003：29 个跟踪文件，禁入路径 0；远程历史已合并 |
| 远程基线分支 | 已核对 | EXP-005：`ls-remote` 与本地 HEAD 均为 `8ee14c0`；后续提交需单独核对 |
| 文档编号与引用 | 通过 | EXP-004：15 个需求编号无重复，Markdown 引用缺失 0，git diff --check 退出码 0 |
| S1 API 测试 | 局部通过 | EXP-004：Node 24 下 3/3 通过 |
| Vue 类型检查与构建 | 局部通过 | EXP-004：两项退出码 0 |
| 暗水印原图与真实转发 | 未运行 | 无编解码器、无固定样本和真实链路结果 |
| 浏览器交互与生产安全 | 未运行 | S1 演示不能代表上线验收 |

- 用户已明确：每个版本若无法推送远程，由用户手动推送。已写入 Agent 与开发流程规范；远程是否成功必须用 SHA 核对。

## 未决事项与下一步

1. 每个版本提交后核对远程分支；若推送失败，按 DEVELOPMENT_WORKFLOW.md 第 6 节交接给用户手动推送，并记录本地与远程状态。
2. 将技术方案和实验门槛交用户审阅；算法细节仍是候选。首批业务页面、身份系统、调查角色、日志留存与目标客户端版本需在生产接入前确定。
3. 方案获用户确认后，才创建功能分支，先处理 T0/T1 原图闭环，再研究真实转发。未确认前不继续功能代码开发。
