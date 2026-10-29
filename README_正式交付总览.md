# 供应雷达 · 供应链数智化工作台正式交付总览

> 本文档是“SAP 自动抓取项目 + 供应链可视化平台 + WorkBuddy 定时协同”的总入口。
> 日常操作先读本文件；具体脚本用途见各项目内的《脚本功能索引》。

## 1. 项目定位

供应雷达不是单一网页，而是一条完整的数据生产链：

1. 从 SAP 自动抓取库存、采购计划和实际收货。
2. 翻译、合并、计算并做部分脱敏。
3. 生成统一的 `dashboard_data.json`。
4. 静态页面读取 JSON，渲染供应链控制塔。
5. WorkBuddy 每天抓取外部行情、执行脚本、校验并推送 GitHub。
6. GitHub Actions 自动部署到 GitHub Pages。

正式页面：

- https://xiejiananaa.github.io/
- https://xiejiananaa.github.io/?route=production/plan
- https://xiejiananaa.github.io/?route=supplier/map
- https://xiejiananaa.github.io/?route=ai/workbuddy

## 2. 两个项目和 WorkBuddy 的分工

### 项目一：SAP 自动抓取与数据生成

本地目录：

```text
D:\Users\22614\Documents\供应雷达
```

负责：

- 启动或检查 SAP GUI。
- 自动执行 ZWM002、ME2L、MB51。
- 生成原始 Excel。
- 翻译为供应雷达标准工作簿。
- 合并 MB51 历史收货。
- 执行安全库存、补货量等计算。
- 按“原样 / 部分 / 完全”三种档位脱敏。
- 可选推送钉钉 AI 表格。

主要入口：

```text
run_pipeline.py
run_pipeline.bat
desensitize_latest.bat
test_export_me2l_mb51.bat
```

### 项目二：供应链可视化平台

本地目录：

```text
D:\Users\22614\Documents\供应链平台
```

负责：

- 把脱敏工作簿和外部行情转换成标准 JSON。
- 校验比赛版数据安全边界。
- 渲染首页、物料、供应商、生产、情报和 AI 协同页面。
- 构建离线单文件分享版。
- 通过 GitHub Actions 发布 GitHub Pages。

主要入口：

```text
运行SAP流水线.bat
更新比赛页面.bat
启动页面.bat
scripts\run_sap_pipeline.ps1
```

### WorkBuddy：每日自动协同

负责：

- 每天抓取外部行情并写入 `data\external_market.json`。
- 触发本地 SAP → JSON 流水线。
- 校验公开数据。
- 只提交公开数据文件并推送 GitHub。
- 不修改页面源码，不绕过安全校验。

每日执行说明见：

```text
WORKBUDDY_GUIDE.md
```

## 3. 总体数据流

```text
SAP GUI
  ├─ ZWM002 库存
  ├─ ME2L 采购计划
  └─ MB51 实际收货
          ↓
供应雷达自动抓取与翻译
          ↓
供应雷达标准工作簿
          ↓
部分脱敏工作簿
          ↓
scripts/generate_data.py
          ↓
data/dashboard_data.json
          ├─ 静态页面唯一数据接口
          ├─ data/dashboard_data.js（双击打开兼容层）
          └─ WorkBuddy / GitHub Actions 发布
```

外部行情单独进入：

```text
WorkBuddy 抓取公开资讯
          ↓
data/external_market.json
          ↓
generate_data.py 合并
          ↓
dashboard_data.json
```

## 4. 交付包目录结构

正式交付包按“总览 + 两个项目 + WorkBuddy + 离线交付”组织：

```text
供应链数智化工作台_正式交付包_日期/
├─ README.md
├─ 00_一键入口/
│  ├─ 01_检查运行环境.bat
│  ├─ 02_抓取SAP并更新页面.bat
│  ├─ 03_只更新页面数据.bat
│  ├─ 04_校验并构建分享版.bat
│  └─ 05_启动本地页面.bat
├─ 01_SAP自动抓取与数据生成/
│  ├─ README.md
│  ├─ 脚本功能索引.md
│  ├─ run_pipeline.py
│  ├─ config.py
│  ├─ requirements.txt
│  ├─ .env.example
│  ├─ assets/
│  ├─ scripts/
│  └─ docs/
├─ 02_供应链可视化平台/
│  ├─ README.md
│  ├─ WORKBUDDY_GUIDE.md
│  ├─ index.html
│  ├─ assets/
│  ├─ data/
│  ├─ scripts/
│  ├─ worker/
│  ├─ .github/
│  └─ dist/
├─ 03_WorkBuddy协同/
│  └─ WORKBUDDY_GUIDE.md
├─ 04_离线交付/
│  └─ 供应雷达-分享讨论版.html
└─ 05_文档与变更记录/
   ├─ 竞品借鉴分析.md
   ├─ 页面改造方案.md
   └─ 版本说明.md
```

## 5. 一鍵执行顺序

### 5.1 每日正式流程

推荐直接双击：

```text
00_一键入口\02_抓取SAP并更新页面.bat
```

内部执行顺序：

```text
检查 SAP GUI
→ 抓取 ZWM002 / ME2L / MB51
→ 翻译与部分脱敏
→ 生成 dashboard_data.json / dashboard_data.js
→ 安全校验
→ 构建离线分享版
```

### 5.2 已有脱敏工作簿，只更新页面

双击：

```text
00_一键入口\03_只更新页面数据.bat
```

该入口不会重新抓 SAP，只使用当前最新的部分脱敏工作簿。

### 5.3 只校验并构建分享版

双击：

```text
00_一键入口\04_校验并构建分享版.bat
```

### 5.4 本地预览

双击：

```text
00_一键入口\05_启动本地页面.bat
```

然后打开：

```text
http://127.0.0.1:8765/
```

## 6. WorkBuddy 每日动作

### 动作一：更新外部行情

写入：

```text
data\external_market.json
```

要求：

- 无法确认的数据写 `null`，不要伪造。
- 抓取失败时保留旧文件。
- 写入后必须检查 JSON 可解析。
- 比赛重点品种保持名称不变：`布伦特原油`、`乙烯`、`苯乙烯`。
- `change_pct` 使用百分数数值；7 天走势由前端动态计算，不写伪造 forecast。
- 写入后执行 `scripts\validate_external_market.py --strict-featured`。

### 动作二：一键执行后续全链路

WorkBuddy 更新 `external_market.json` 后执行：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "D:\Users\22614\Documents\供应链平台\scripts\run_daily_automation.ps1"
```

总控脚本自动完成：

- 外部行情字段与 48 小时时效校验
- ZWM002 / ME2L / MB51 抓取
- 三路抓取 `status=ok` 门禁
- 翻译与部分脱敏
- JSON / JS 生成
- 看板安全校验与基线校验
- 分享版构建
- 白名单数据提交
- `git push origin main`

运行报告：

```text
%TEMP%\SAPRadar_outputs\daily_run_latest.json
```

只有退出码为 0 且报告 `status=ok` 才视为成功。

### 动作三：发布白名单

日常自动任务只允许提交：

```text
data\external_market.json
data\dashboard_data.json
data\dashboard_data.js
```

禁止：

```text
git add .
git add data/
git push --force
```
## 7. 脚本命名和中文索引

为保证自动任务稳定，Python/PowerShell 原始文件名继续使用英文。

人工操作入口使用中文 `.bat` 名称；每个项目均附带：

```text
脚本功能索引.md
```

索引会说明：

- 文件名
- 中文功能
- 使用场景
- 是否日常入口
- 是否为兼容保留脚本

不要直接重命名被其他脚本 import 的 `.py` 文件，否则可能破坏流水线。

## 8. 数据安全边界

比赛公开版必须满足：

- 模式：`competition`
- 工厂：仅 `1501`
- 单位：`kg`
- 脱敏：是
- 禁止出现工厂 `1160`
- 禁止提交 SAP 原始 Excel、MB51、内部 JSON、账号、Token、密钥

不进入交付包的内容：

```text
.env
.venv/
vendor/
__pycache__/
logs/
backup/
data/raw/
data/receipts/
data/me2l/
data/consumption/
data/internal/
```

## 9. 关键产物

| 产物 | 路径 |
|---|---|
| 公开 JSON | `02_供应链可视化平台\data\dashboard_data.json` |
| 本地双击桥接 | `02_供应链可视化平台\data\dashboard_data.js` |
| 外部行情 | `02_供应链可视化平台\data\external_market.json` |
| 离线完整 HTML | `04_离线交付\供应雷达-分享讨论版.html` |
| GitHub Pages 页面 | https://xiejiananaa.github.io/ |

## 10. 当前版本

- 页面视觉：V3 暖纸灰 + 墨蓝 + 陶土色阶
- 页面字体：本地 Inter 可变字体 + 中文系统字体
- 字体资源：`assets\fonts\inter-var.woff2`
- 导航：深海军蓝侧栏 + 青蓝激活态
- 图表：统一墨蓝 / 灰绿 / 陶土序列
- 单文件分享版：字体已内嵌，可离线打开

## 11. 常见问题

### 双击 `index.html` 提示读取数据失败

确认以下文件存在：

```text
data\dashboard_data.js
```

若不存在，运行：

```text
更新比赛页面.bat
```

或直接打开离线分享版：

```text
dist\供应雷达-分享讨论版.html
```

### SAP 抓取失败

检查：

- SAP GUI 是否已登录。
- Windows 桌面是否保持解锁。
- `.env` 是否存在且配置正确。
- 当前事务窗口是否可操作。

### 页面数据没有更新

检查：

1. `data\dashboard_data.json` 修改时间。
2. `data\dashboard_data.js` 是否同步更新。
3. 是否通过 `generate_data.py` 生成，而不是手工修改。
4. 浏览器是否仍在缓存旧版本。

### GitHub Pages 没有更新

检查：

- `data\dashboard_data.json` 是否已提交。
- GitHub Actions 是否成功。
- Pages 是否部署到 `main` 分支。

## 12. 正式入口

- 在线页面：https://xiejiananaa.github.io/
- GitHub 仓库：https://github.com/Xiejiananaa/Xiejiananaa.github.io
- WorkBuddy 页面：https://xiejiananaa.github.io/?route=ai/workbuddy
- 单文件分享版：`04_离线交付\供应雷达-分享讨论版.html`