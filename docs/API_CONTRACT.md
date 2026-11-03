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
