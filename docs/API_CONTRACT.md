# HTTP 契约 v1（S1 演示实现）

状态：实施基线。所有成功响应为 JSON，所有错误响应为 `{ "error": { "code": string, "message": string }, "requestId": string }`。时间使用 UTC ISO 8601 字符串。浏览器用同源 HttpOnly Cookie 认证，不在请求体传 `subjectId`。正式身份系统接入时保留业务接口语义。

| 方法与路径 | 权限 | 成功响应 | 主要错误 |
| --- | --- | --- | --- |
| `POST /api/demo/login` | 演示环境 | `{ user: { alias, role, tenantId }, watermark }` 并设置会话 Cookie | 400、403、503 |
| `POST /api/demo/logout` | 已登录 | `{ ok: true }` 并清除 Cookie | 401 |
| `GET /api/demo/me` | 已登录 | `{ user: { alias, role, tenantId }, watermark }` | 401 |
| `GET /api/protected/report/view` | 有报表权限 | `{ content: { title, rows }, watermark }` | 401、403、409 |
| `POST /api/demo/refresh-watermark` | 已登录 | `{ watermark }` | 401、403、503 |
| `POST /api/watermark/v1/verify` | 调查员 | `{ match: { code, tenantId, alias, resourceId, issuedAt, expiresAt, accessEventId } }` | 400、401、403、404、429 |

演示身份选择仅用于本地验证，不能作为生产身份认证。跨租户码和不存在码对调查界面均返回 `404`；服务端审计区分两者。核验请求体：`{ "code": "....", "caseId": "CASE-..." }`；`caseId` 必填且限制长度。所有写请求检查 Origin。追溯码去除分隔符后为 20 位 Base32 大写字符，客户端只负责展示。当前实验在模拟登录时签发，受保护报表读取复用当前租约；过期后仍可做历史核验。生产签发时机与资源授权待真实业务系统接入后定案。

未来 Java/其他语言实现必须满足同一契约和测试样本，包括状态码、错误码、租户隔离、时间格式与授权语义。不得要求 Vue 层读取 Node.js 私有字段。
## 暗水印接口扩展草案（未实现，待审阅）

生产暗水印接口与编码格式尚待设计和验收。当前实验图片为服务端生成的 SVG 图块，不承诺与未来 PNG 图块或生产接口兼容。图块与可见码对应同一租约；返回值不包含生成密钥、用户原始标识或可用于访问其他租约的凭据。正式业务接口仍须在返回敏感内容前完成授权与签发。

拟新增 POST /api/watermark/v1/extractions：受权调查员以 multipart/form-data 提交 caseId 和 image；首批接受 PNG、JPEG、WebP，文件上限暂定 20 MiB。服务端先验证调查权限及案件范围，再计算原文件 SHA-256、解码和提取。成功响应包含 status（matched、uncertain、not_detected）、detectionScore、evidenceId、requestId、algorithmVersion；仅 matched 返回最小必要 match 事实。confidence（0–1）为可选字段，只有独立样本校准完成后才提供；未校准的 detectionScore 不代表概率。not_detected 表示未达到同步或检测阈值；uncertain 表示有候选信号但纠错、唯一映射或匹配阈值不足。接口不得自动归属责任。错误沿用现有 JSON 错误结构，覆盖 400、401、403、413、415、429、503；对跨租户与不存在租约避免可枚举差异。

图片提取与可见码 verify 是独立调查路径；可见码 OCR 成功不计为暗水印提取成功。所有查询均记审计，原始图片留存、加密和删除期限在生产接入前由业务与安全负责人确认。

## 本轮实验图片契约（ADR-015）

模拟登录成功响应增加 `watermark`，包含 `code`、`signalId`、`issuedAt`、`expiresAt`、`algorithmVersion`、`imageDataUrl`、`width`、`height`。`imageDataUrl` 为服务端生成的 SVG data URL；前端不生成图案。`GET /api/demo/me` 返回当前租约供刷新后恢复；`POST /api/demo/refresh-watermark` 重新签发。本轮试验台在浏览器本地读取截图像素，使用当前登录租约的 `signalId` 辅助同步，仅在完整 64 位提取值与当前租约一致时显示匹配；这不是跨租约调查接口或真实平台验收。输入限 PNG/JPEG/WebP、20 MiB、1600 万像素；宽或高低于 640×360 像素下限时返回证据不足。
