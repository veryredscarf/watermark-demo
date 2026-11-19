# 固定浏览器原图回归样本

两张 PNG 均由本仓库的虚构演示页在 Chrome 154.0.8037.92、Windows、100% 页面缩放下生成，不含真实业务数据或社交平台文件。`original-chrome154.png` 是完整可见视口，`crop-640x360-chrome154.png` 是从同次视口的 `(600, 0)` 位置截取的 640×360 区域。两张图对应同一实验租约，可见码 `BAJZ-XYE5-P7KE-NQ4S-UILQ`、64 位标识 `49e350bb53366479`、算法版本 `lab-pair-1`、暗图案 opacity 0.05。

| 文件 | SHA-256 | 字节数 |
| --- | --- | ---: |
| `original-chrome154.png` | `7DCCC1F6F84588D516D29884DBCE74CBE8C70D66F45E2DD0B29CF1A806D1301A` | 60572 |
| `crop-640x360-chrome154.png` | `28EA716E909F711C0085737D541036ECA50B8A79BFD6D7B2C59003D9EE84F55C` | 10499 |

运行 `node scripts/browser-smoke.mjs` 会同时检查新生成的原图、区域图和这两张固定样本。它只证明当前租约辅助同步的原图自检，不计入 T1、T1-C 或平台转发验收。
