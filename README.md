# watermark-demo

企业网页水印与截图溯源实验项目。前端采用 Vue 3，首版后端采用 Node.js。

> 当前分支保存的是**未验收的 S1 可见水印演示原型**。暗水印编码、图片提取和社交平台两次非原图转发能力尚未实现；任何成功率均是目标，不是实测结论。技术方案经用户确认前不继续编写新功能代码。

## 文档入口

- [Agent 工作规范](AGENTS.md)
- [当前状态与下一步](docs/PROJECT_STATE.md)
- [项目计划](docs/PROJECT_PLAN.md)
- [需求与验收](docs/REQUIREMENTS.md)
- [明暗水印技术方案草案](docs/WATERMARK_RESEARCH_PLAN.md)
- [实验与验收协议草案](docs/BENCHMARK_PROTOCOL.md)
- [架构与信任边界](docs/ARCHITECTURE.md)
- [接口契约](docs/API_CONTRACT.md)
- [实验记录](docs/EXPERIMENT_LOG.md)

## 仓库卫生

开发使用独立分支和 PR。node_modules、缓存、构建产物、.env、密钥、真实业务截图、原始平台转发样本和大型模型权重不得提交。提交前应逐项核对 Git 暂存区；.gitignore 不能替代审查。
