# HTTP 契约 v1（S1 演示实现）

状态：实施基线。所有成功响应为 JSON，所有错误响应为 `{ "error": { "code": string, "message": string }, "requestId": string }`。时间使用 UTC ISO 8601 字符串。浏览器用同源 HttpOnly Cookie 认证，不在请求体传 `subjectId`。正式身份系统接入时保留业务接口语义。

| 方法与路径 | 权限 | 成功响应 | 主要错误 |
| --- | --- | --- | --- |
| `POST /api/demo/login` | 演示环境 | `{ user: { alias, role, tenantId } }` 并设置会话 Cookie | 400、403 |
| `POST /api/demo/logout` | 已登录 | `{ ok: true }` 并清除 Cookie | 401 |
| `GET /api/demo/me` | 已登录 | `{ user: { alias, role, tenantId } }` | 401 |
| `GET /api/protected/report/view` | 有报表权限 | `{ content: { title, rows }, watermark: { code, issuedAt, expiresAt, displayText, policyVersion, layout } }` | 401、403、503 |
| `POST /api/watermark/v1/verify` | 调查员 | `{ match: { code, tenantId, alias, resourceId, issuedAt, expiresAt, accessEventId } }` | 400、401、403、404、429 |

演示身份选择仅用于本地验证，不能作为生产身份认证。跨租户码和不存在码对调查界面均返回 `404`；服务端审计区分两者。核验请求体：`{ "code": "....", "caseId": "CASE-..." }`；`caseId` 必填且限制长度。所有写请求检查 Origin。追溯码去除分隔符后为 20 位 Base32 大写字符，客户端只负责展示。码随一次受保护查看签发；过期后仍可做历史核验。

未来 Java/其他语言实现必须满足同一契约和测试样本，包括状态码、错误码、租户隔离、时间格式与授权语义。不得要求 Vue 层读取 Node.js 私有字段。
## 暗水印接口扩展草案（未实现，待审阅）

现有 GET /api/protected/report/view 的 watermark 对象拟增加 covert：algorithmVersion、tilePngBase64、tileSize、opacity。图块与可见码对应同一租约；返回值不包含生成密钥、用户原始标识或可用于访问其他租约的凭据。正式业务接口仍须在返回敏感内容前完成授权与签发。

拟新增 POST /api/watermark/v1/extractions：受权调查员以 multipart/form-data 提交 caseId 和 image；首批接受 PNG、JPEG、WebP，文件上限暂定 20 MiB。服务端先验证调查权限及案件范围，再计算原文件 SHA-256、解码和提取。成功响应包含 status（matched、uncertain、not_detected）、confidence（0–1，经独立样本校准后才提供）、evidenceId、requestId、algorithmVersion；仅 matched 返回最小必要 match 事实。未完成置信度校准时接口不得对外宣称概率或自动归属。错误沿用现有 JSON 错误结构，覆盖 400、401、403、413、415、429、503；对跨租户与不存在租约避免可枚举差异。

图片提取与可见码 verify 是独立调查路径；可见码 OCR 成功不计为暗水印提取成功。所有查询均记审计，原始图片留存、加密和删除期限在生产接入前由业务与安全负责人确认。
