# 供应雷达 · 供应链决策工作台

供应雷达采用“数据与展示分离”架构：

```text
SAP Excel + WorkBuddy 外部行情
        ↓
scripts/generate_data.py
        ↓
data/dashboard_data.json（唯一前端数据接口）
        ↓
静态 HTML / ECharts
        ↓
GitHub Actions → GitHub Pages
```

## 1. 在线地址

- 正式比赛页面：https://xiejiananaa.github.io/
- 行业情报页面：https://xiejiananaa.github.io/?route=intel/industry
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
| SAP / Excel | 库存、消耗、PO、到货、MB51 等业务底表 |
| WorkBuddy | 抓取公开行情，写入 `data/external_market.json`，执行计算、校验和推送 |
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
data/internal/dashboard_data.json  内部版数据，禁止公开

scripts/generate_data.py           Excel + 行情 → dashboard_data.json
scripts/validate_dashboard_data.py 发布前安全校验
scripts/build_share_html.py        生成离线单文件分享版
scripts/build_cloudflare_site.mjs  Cloudflare 内部版构建辅助

.github/workflows/deploy-pages.yml GitHub Pages 自动部署
WORKBUDDY_GUIDE.md                 WorkBuddy 每日执行说明书
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

#### SAP 抓取数据

比赛版输入通常来自部分脱敏工作簿。生成脚本优先级：

1. `--input` 指定文件
2. `SUPPLY_INPUT` 环境变量
3. `data/inventory_report_test.xlsx`
4. 相邻项目的总表文件
5. `data/*总表*.xlsx`

比赛版生成前要确认输入表属于脱敏版，且只包含允许公开的工厂数据。

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

完整顺序：

```text
1. git pull --rebase
2. 抓取公开行情并写入 data/external_market.json
3. 执行 generate_data.py --mode competition
4. 执行 validate_dashboard_data.py --mode competition
5. 只提交 external_market.json 和 dashboard_data.json
6. git push origin main
7. GitHub Actions 自动部署
```

WorkBuddy 不负责：

- 修改页面代码
- 修改 Cloudflare 配置
- 提交 Excel 或内部数据
- 生成内部版公开页面
- 处理 Cloudflare Access

## 7. 一键更新比赛页面

也可以双击：

```text
更新比赛页面.bat
```

它会依次执行：

1. 生成比赛版数据
2. 校验数据
3. 构建单文件分享版

之后双击 `启动页面.bat` 打开本地页面。

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

### JSON 校验失败

不要继续推送。保留上一版 `dashboard_data.json`，查看校验输出并修复输入数据。