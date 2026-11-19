# watermark-demo

企业网页水印与截图溯源实验项目。前端采用 Vue 3，首版后端采用 Node.js。

> 当前功能分支是**未验收的实验原型**：模拟登录时 Node.js 返回明暗水印 SVG 图块，Vue 3 平铺图片，浏览器试验台只对当前租约做原图自检。完整 T1 样本集、社交平台两次非原图转发、真实系统全部列表页接入均未通过验收。任何成功率指标仍是目标。

## 本地运行

需要 Node.js 24、pnpm 11。先执行 `pnpm install`，再执行 `pnpm dev`，打开 `http://localhost:5173/`。选择虚构身份登录后，页面展示服务端水印图；试验台可上传当前页面截图并显示提取的 64 位标识。默认 SQLite 数据写入被 Git 忽略的 `artifacts/runtime/`；数据库文件、原始截图和真实业务数据不要提交。`pnpm test`、`pnpm typecheck`、`pnpm build` 用于基础校验。关闭占用 4173/5173 端口的服务后，可用 `node scripts/browser-smoke.mjs` 运行 Chrome/Edge 原图与 640×360 区域截图回归；其他浏览器路径通过 `WM_CHROME_PATH` 指定。

## 文档入口

- [Agent 工作规范](AGENTS.md)
- [当前状态与下一步](docs/PROJECT_STATE.md)
- [项目计划](docs/PROJECT_PLAN.md)
- [需求与验收](docs/REQUIREMENTS.md)
- [明暗水印技术方案草案](docs/WATERMARK_RESEARCH_PLAN.md)
- [目标系统截图对应的 SDK 接入设计](docs/TARGET_SYSTEM_INTEGRATION.md)
- [本地持久化方案草案](docs/LOCAL_STORAGE_PLAN.md)
- [实验与验收协议草案](docs/BENCHMARK_PROTOCOL.md)
- [架构与信任边界](docs/ARCHITECTURE.md)
- [接口契约](docs/API_CONTRACT.md)
- [实验记录](docs/EXPERIMENT_LOG.md)

## 仓库卫生

开发使用独立分支和 PR。node_modules、缓存、构建产物、.env、密钥、真实业务截图、原始平台转发样本和大型模型权重不得提交。提交前应逐项核对 Git 暂存区；.gitignore 不能替代审查。
