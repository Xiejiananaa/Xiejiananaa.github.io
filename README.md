# 供应雷达 · 供应链决策工作台

供应雷达采用“数据与展示分离”架构：

```text
SAP GUI 自动抓取（ZWM002 / ME2L / MB51）
        ↓
自动翻译 + 部分脱敏 Excel
        +
WorkBuddy 外部行情 JSON
        ↓
scripts/generate_data.py
        ↓
data/dashboard_data.json（唯一前端数据接口）
        ↓
静态 HTML / ECharts
        ↓
GitHub Actions → GitHub Pages
```

> **正式交付总览：** 参见 `README_正式交付总览.md`，包含 SAP 自动抓取、供应链可视化平台和 WorkBuddy 的完整运行说明。
>
> **脚本中文索引：** 参见 `scripts/脚本功能索引.md`。
>
> **当前视觉版本：** V3 暖纸灰 + 墨蓝 + 陶土色阶；本地 Inter 字体；深海军蓝导航。
## 1. 在线地址

- 正式比赛页面：https://xiejiananaa.github.io/
- 行业情报页面：https://xiejiananaa.github.io/?route=intel/industry
- WorkBuddy 协同页：https://xiejiananaa.github.io/?route=ai/workbuddy
- GitHub 仓库：https://github.com/Xiejiananaa/Xiejiananaa.github.io
- 自动部署工作流：`.github/workflows/deploy-pages.yml`

当前公开版规则：

```text
模式：competition
工厂：仅 1501
单位：kg
脱敏：是
1160 工厂数据：不进入公开页面
```

## 2. 系统分工

| 模块 | 负责内容 |
|---|---|
| SAP GUI 自动化 | 自动导出 ZWM002 库存、ME2L、MB51，生成原始 Excel |
| SAP 翻译与脱敏 | 把原始表编译成供应雷达总表，并按比赛模式生成部分脱敏工作簿 |
| WorkBuddy | 定时触发 SAP 自动化，抓取公开行情，执行计算、校验和推送 |
| Codex / 本地代码 | 数据计算脚本、JSON 接口、前端页面、图表和交互 |
| GitHub Actions | 校验公开 JSON、构建单文件分享版、部署 GitHub Pages |
| GitHub Pages | 比赛版在线页面 |
| Cloudflare Worker | 内部版预留，Basic Auth 已完成，当前暂停自动构建 |

## 3. 关键文件

```text
index.html                         页面骨架
assets/app.js                      数据加载、图表、筛选、行业情报渲染、AI 助手
assets/styles.css                  全局视觉、响应式布局、行业情报卡片样式
assets/echarts.min.js              本地 ECharts
assets/china.geo.json              本地中国地图
assets/供应商地域映射.csv           地域识别辅助数据

data/external_market.json          WorkBuddy 每日行情输入
data/external_market.example.json  行情字段示例
data/dashboard_data.json           前端唯一公开数据接口
data/dashboard_data.js             双击 index.html 时的本地数据桥接（由生成脚本同步）
data/internal/dashboard_data.json  内部版数据，禁止公开

scripts/run_sap_pipeline.ps1        SAP 抓取 → 翻译 → 脱敏 → 编译 → 校验
scripts/run_daily_automation.ps1     第一阶段一键总控：行情校验 → SAP → 校验 → 提交 → 推送
运行每日自动化.bat                   第一阶段一键入口；WorkBuddy 和 Windows 定时任务共用
运行SAP流水线.bat                   备用入口；失败时使用 powershell.exe 命令
scripts/generate_data.py           Excel + 行情 → dashboard_data.json + dashboard_data.js
scripts/validate_external_market.py 检查 WorkBuddy 行情字段与比赛重点品种
scripts/validate_dashboard_data.py 发布前安全校验
scripts/build_share_html.py        生成离线单文件分享版
scripts/build_cloudflare_site.mjs  Cloudflare 内部版构建辅助

.github/workflows/deploy-pages.yml GitHub Pages 自动部署
WORKBUDDY_GUIDE.md                 WorkBuddy 每日执行说明书
delivery_templates/WorkBuddy第一阶段一键提示词.md  WorkBuddy 第一阶段一键执行提示词
TASKS.md                           项目任务清单
```

## 4. 环境准备

本机推荐使用现有 Python 虚拟环境：

```powershell
$ROOT = "D:\Users\22614\Documents\供应链平台"
$PY = "D:\Users\22614\Documents\供应雷达\.venv\Scripts\python.exe"

Set-Location $ROOT
$env:PYTHONUTF8 = "1"
$env:PYTHONIOENCODING = "utf-8"
```

检查 Git 和运行环境：

```powershell
git remote -v
& $PY --version
node --version
```

预期远程仓库：

```text
origin = https://github.com/Xiejiananaa/Xiejiananaa.github.io.git
branch = main
```

## 5. 完整运行流程

以下流程可用于完整手动操作和验收一遍。

### 第一步：同步 GitHub 最新代码

```powershell
Set-Location $ROOT
git pull --rebase
if ($LASTEXITCODE -ne 0) { throw "git pull --rebase 失败" }
```

如果本地没有未提交改动，也可以先查看状态：

```powershell
git status --short --branch
```

### 第二步：准备两类输入

#### 外部行情

WorkBuddy 写入或更新：

```text
data\external_market.json
```

页面和 JSON 会使用以下字段：

```json
{
  "name": "环氧乙烷",
  "category": "基础化工",
  "price": 9700,
  "unit": "元/吨",
  "change_pct": "0%",
  "change": 0,
  "date": "2026-10-22",
  "source": "隆众资讯 / 生意社",
  "url": "https://example.com/article",
  "summary": "华东出厂9700元/吨，持稳。"
}
```

`change_pct` 支持数字或带 `%` 的字符串；没有可靠涨跌数据时写 `null`，不要补造成 0。

#### SAP 数据自动抓取

SAP 抓取由 `D:\Users\22614\Documents\供应雷达\run_pipeline.py` 负责：

```text
ZWM002 库存
+ ME2L 采购计划
+ MB51 实际收货
        ↓
原始 Excel
        ↓
sap_translator.py 翻译
        ↓
供应雷达自动总表
        ↓
desensitizer.py 部分脱敏
```

环境检查：

```powershell
$SAPROOT = "D:\Users\22614\Documents\供应雷达"
$SAPPY = "D:\Users\22614\Documents\供应雷达\.venv\Scripts\python.exe"

Set-Location $SAPROOT
& $SAPPY run_pipeline.py --check
if ($LASTEXITCODE -ne 0) { throw "SAP 自动化环境检查失败" }
```

执行完整抓取、翻译和部分脱敏：

```powershell
Set-Location $SAPROOT
& $SAPPY run_pipeline.py --mask-mode 部分 --fetch-profiles ZWM002,ME2L,MB51
if ($LASTEXITCODE -ne 0) { throw "SAP 抓取流水线失败" }
```

默认输出目录：

```text
%TEMP%\SAPRadar_outputs\desensitized\供应雷达-本地版_脱敏_部分_*.xlsx
```

SAP GUI 必须已安装并完成登录，自动化运行时 Windows 桌面需要保持解锁。推荐用同一个 Windows 用户运行，并启用“仅在用户登录时运行”的计划任务。

随后 `generate_data.py` 会自动选择最新的部分脱敏工作簿。也可以通过 `--input` 明确指定：

```powershell
& $PY scripts\generate_data.py --mode competition --input "完整脱敏工作簿路径.xlsx"
```

### 第三步：生成 dashboard_data.json

```powershell
& $PY scripts/generate_data.py --mode competition
if ($LASTEXITCODE -ne 0) { throw "数据生成失败" }
```

预期输出：

```text
data\dashboard_data.json
```

### 第四步：执行发布前安全校验

```powershell
& $PY scripts/validate_dashboard_data.py --mode competition
if ($LASTEXITCODE -ne 0) { throw "数据校验失败，停止发布" }
```

校验会检查：

- 顶层 JSON 结构是否完整
- 是否为 competition 模式
- 是否仅包含工厂 1501
- 是否混入 1160 数据
- 物料描述和供应商名称是否保持脱敏
- 是否包含内部生产数据、绝对路径或密钥字段
- 行数统计与实际数组长度是否一致

> WorkBuddy 可以使用一条命令自动执行上面的 SAP 抓取、编译和校验：
>
> ```powershell
> powershell.exe -NoProfile -ExecutionPolicy Bypass -File "D:\Users\22614\Documents\供应链平台\scripts\run_sap_pipeline.ps1" -MaskMode 部分
> ```
>
> 已实机验证：如果 `.bat` 仍被系统环境拦截，直接使用上面的 `powershell.exe -NoProfile -ExecutionPolicy Bypass -File ...` 命令，不需要修改全局执行策略。
>
> 只检查环境、不执行 SAP：
>
> ```powershell
> powershell.exe -NoProfile -ExecutionPolicy Bypass -File "D:\Users\22614\Documents\供应链平台\scripts\run_sap_pipeline.ps1" -CheckOnly -SkipSapFetch
> ```

> **直接双击查看**：可以直接打开 `index.html`。浏览器在 `file://` 下会禁止读取本地 JSON，页面会自动改为加载由 `generate_data.py` 同步生成的 `data/dashboard_data.js`，不需要启动 HTTP 服务。
>
> 如果该桥接文件不存在，先运行 `python scripts/generate_data.py`，或直接打开 `dist/供应雷达-分享讨论版.html`。
### 第五步：本地启动页面验收

先在一个终端启动服务：

```powershell
Set-Location $ROOT
& $PY -m http.server 8765 --bind 127.0.0.1
```

再打开：

```text
http://127.0.0.1:8765/
```

重点验收页面：

```text
http://127.0.0.1:8765/?route=today/home
http://127.0.0.1:8765/?route=supply/gap
http://127.0.0.1:8765/?route=supplier/portrait
http://127.0.0.1:8765/?route=production/plan
http://127.0.0.1:8765/?route=intel/industry
http://127.0.0.1:8765/?route=ai/tasks
```

行业情报页面应显示：

- 行情快照
- 品类结构与平均涨跌
- 涨跌最大的重点品种
- WorkBuddy 资讯摘要、来源、日期和原文链接
- `null` 涨跌应显示“未标注”，不能显示为持稳

### 第六步：生成离线分享版

```powershell
& $PY scripts/build_share_html.py
if ($LASTEXITCODE -ne 0) { throw "分享版构建失败" }
```

输出：

```text
dist\供应雷达-分享讨论版.html
```

该文件内嵌 JSON、ECharts 和地图，可双击打开，也可压缩成 ZIP 发给同事。

### 第七步：推送 GitHub

WorkBuddy 日常任务只允许提交两个数据文件：

```powershell
git add -- data\external_market.json data\dashboard_data.json
if ($LASTEXITCODE -ne 0) { throw "git add 失败" }

git diff --cached --quiet
if ($LASTEXITCODE -eq 1) {
  git commit -m "每日更新数据 $(Get-Date -Format yyyy-MM-dd)"
  if ($LASTEXITCODE -ne 0) { throw "git commit 失败" }
  git push origin main
  if ($LASTEXITCODE -ne 0) { throw "git push 失败" }
} elseif ($LASTEXITCODE -ne 0) {
  throw "检查暂存区失败"
} else {
  Write-Output "数据没有变化，跳过提交"
}
```

禁止：

```text
git add .
git add data/
git push --force
```

禁止提交：

- `data/internal/`
- SAP Excel / MB51
- `.env`、Token、API Key
- 1160 工厂数据

### 第八步：确认 GitHub Actions 和线上页面

推送后进入：

```text
https://github.com/Xiejiananaa/Xiejiananaa.github.io/actions
```

确认 `Validate and deploy supply radar` 为绿色成功，然后打开：

```text
https://xiejiananaa.github.io/
```

GitHub Actions 会：

1. 校验 `data/dashboard_data.json`
2. 构建单文件分享版
3. 按公开白名单组装发布目录
4. 部署到 GitHub Pages

## 6. WorkBuddy 每日运行方式

WorkBuddy 严格按 `WORKBUDDY_GUIDE.md` 执行。

比赛演示时不需要打开 PowerShell，直接打开：

```text
https://xiejiananaa.github.io/?route=ai/workbuddy
```

该页面会展示：

- WorkBuddy Agent 身份和最近一次协同状态
- SAP 抓取、翻译、脱敏、JSON 编译、安全校验、GitHub Pages 发布链路
- 最近数据时间、工作簿、物料数、供应商数和行情条数
- GitHub Actions 与仓库证据链接

页面顶部还会常驻“WorkBuddy 已协同”徽标，点击可直达协同页。

完整顺序：

```text
1. git pull --rebase origin main
2. 抓取公开行情并写入 data/external_market.json
3. 执行 scripts/run_daily_automation.ps1
4. 总控脚本校验行情时效、执行 SAP、脱敏、生成 JSON
5. 严格检查 ZWM002 / ME2L / MB51 三路状态
6. 自动校验、提交白名单数据并推送 main
7. 检查 daily_run_latest.json 的 status=ok
8. GitHub Actions 自动部署
```
`run_sap_pipeline.ps1` 内部会完成：

```text
SAP ZWM002 / ME2L / MB51 抓取
→ 自动翻译
→ 部分脱敏
→ generate_data.py
→ validate_dashboard_data.py
```

因此 WorkBuddy 不需要自己理解 Excel 字段，也不要直接修改 JSON。

SAP 自动化必须运行在安装并登录 SAP GUI 的 Windows 机器上，桌面会话需要保持解锁。如果 WorkBuddy 与 SAP GUI 不在同一台机器，应由 SAP 主机上的计划任务执行该脚本，WorkBuddy 只负责接收成功信号后推送 GitHub。

WorkBuddy 不负责：

- 修改页面代码
- 修改 Cloudflare 配置
- 提交 Excel 或内部数据
- 生成内部版公开页面
- 处理 Cloudflare Access

## 7. 一键更新比赛页面

也可以双击：

```text
运行每日自动化.bat
```

WorkBuddy 负责先更新 `external_market.json`，随后由这个入口完成全部发布步骤。

它会依次执行：

1. 校验外部行情字段与 48 小时时效
2. 抓取 ZWM002、ME2L、MB51
3. 严格检查三路抓取状态
4. 翻译、部分脱敏、生成 JSON / JS
5. 执行看板安全校验与基线校验
6. 构建单文件分享版
7. 只提交公开数据并推送 GitHub
8. 写入 `daily_run_latest.json` 运行报告

之后可双击 `启动页面.bat` 做本地验收。

## 8. 内部版运行规则

```powershell
& $PY scripts/generate_data.py --mode internal
& $PY scripts/validate_dashboard_data.py --mode internal --input data\internal\dashboard_data.json
```

内部版可以包含全部工厂和 1160 数据，但：

- 不推送公开 GitHub
- 不进入 GitHub Pages 发布目录
- 不生成公开分享 HTML
- 只能使用内部受控入口

## 9. Cloudflare 内部版预留

Cloudflare Worker 已具备 Basic Auth 代码：

```text
worker/index.js
wrangler.jsonc
scripts/build_cloudflare_site.mjs
```

当前因为 `workers.dev` 在国内访问不稳定，Cloudflare 自动构建已暂停。后续启用需要：

1. 绑定可控的自定义域名
2. 恢复 Cloudflare 自动构建
3. 验证 Basic Auth、`dashboard_data.json` 和静态资源
4. 如需邮箱白名单，再启用 Cloudflare Access

## 10. 常见问题

### 页面一直显示“正在读取供应数据”

确认通过 HTTP 打开页面，不要直接双击 `index.html`：

```text
http://127.0.0.1:8765/
```

并检查：

```text
data/dashboard_data.json
```

是否返回 200。

### 行业情报为空

检查 `data/external_market.json` 的 `items` 是否为数组，每条数据是否包含：

```text
name / category / change_pct / date / source / url / summary
```

### 浏览器仍显示旧页面

使用：

```text
Ctrl + F5
```

或等待 GitHub Pages 缓存刷新。页面静态资源已带版本参数。

### PowerShell 提示“在此系统上禁止运行脚本”

不要修改全局执行策略，直接使用进程级 Bypass：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "D:\Users\22614\Documents\供应链平台\scripts\run_sap_pipeline.ps1" -MaskMode 部分
```

也可以直接运行：

```text
D:\Users\22614\Documents\供应链平台\运行SAP流水线.bat
```

### JSON 校验失败

不要继续推送。保留上一版 `dashboard_data.json`，查看校验输出并修复输入数据。