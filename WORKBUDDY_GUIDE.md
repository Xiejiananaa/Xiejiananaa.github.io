# WorkBuddy 每日协同说明书

## 1. 目标和边界

本项目采用“数据与展示分离”：

- Codex 负责 Excel 计算、JSON 标准接口和静态页面。
- WorkBuddy 负责抓取外部行情、执行计算脚本、校验并发布 JSON。
- 前端只读取 `data/dashboard_data.json`，不直接访问 SAP、Excel 或 GitHub API。
- GitHub 只作为发布和备份通道，不成为页面运行时的数据依赖。

### 比赛公开版必须满足

- 只生成 `competition` 模式。
- 只允许工厂 `1501`。
- 禁止出现工厂 `1160` 数据。
- 禁止提交任何 SAP Excel、MB51、内部版 JSON、账号、Token 或密钥。
- 公开版物料和供应商信息必须保持部分脱敏。

## 2. SAP 数据抓取边界

SAP 数据不是 WorkBuddy 直接解析 Excel，而是由 SAP 自动化流水线完成：

```text
ZWM002 库存
ME2L 采购计划
MB51 实际收货
→ 自动翻译
→ 部分脱敏
→ 供应雷达工作簿
```

统一执行入口：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "D:\Users\22614\Documents\供应链平台\scripts\run_sap_pipeline.ps1" -MaskMode 部分
```

该入口会继续执行 `generate_data.py` 和 `validate_dashboard_data.py`。

推荐通过 Bypass 启动，避免 Windows 执行策略拦截：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "D:\Users\22614\Documents\供应链平台\scripts\run_sap_pipeline.ps1" -MaskMode 部分
```

前提条件：

- SAP GUI 已安装并登录。
- Windows 桌面保持解锁。
- WorkBuddy 与 SAP GUI 使用同一个 Windows 用户，或 WorkBuddy 能远程触发该主机任务。
- 抓取失败时停止，不提交旧数据冒充当天数据。

## 3. 工作目录和解释器

```text
项目目录：D:\Users\22614\Documents\供应链平台
Python：D:\Users\22614\Documents\供应雷达\.venv\Scripts\python.exe
公开数据：data\dashboard_data.json
本地桥接：data\dashboard_data.js（由 generate_data.py 同步生成）
行情输入：data\external_market.json
内部数据：data\internal\dashboard_data.json（禁止发布）
```

执行前设置：

```powershell
$ROOT = "D:\Users\22614\Documents\供应链平台"
$PY = "D:\Users\22614\Documents\供应雷达\.venv\Scripts\python.exe"
Set-Location $ROOT
$env:PYTHONUTF8 = "1"
$env:PYTHONIOENCODING = "utf-8"
```

## 4. 动作一：抓取外部行情并写入 external_market.json

> 如果是定时任务，先同步远端代码，再抓行情：
>
> ```powershell
> git pull --rebase
> if ($LASTEXITCODE -ne 0) { throw "git pull --rebase 失败，停止本次任务" }
> ```

WorkBuddy 将结果写入：

```text
data\external_market.json
```

推荐结构：

```json
{
  "updated_at": "2026-10-22T07:30:00+08:00",
  "source": "WorkBuddy",
  "items": [
    {
      "name": "布伦特原油",
      "category": "能源",
      "price": 91.62,
      "unit": "美元/桶",
      "change_pct": 0.66,
      "change": 0.6,
      "date": "2026-10-22",
      "source": "公开资讯来源",
      "url": "https://example.com/article",
      "summary": "一句话摘要"
    }
  ],
  "note": ""
}
```

要求：

1. `items` 必须是数组。
2. 每个条目至少包含 `name`。
3. 没有可靠价格时，`price` 可以为 `null`，不要编造。
4. `change_pct` 使用百分数，例如上涨 1.2% 写 `1.2`。
5. 抓取失败时最多重试 3 次；不要写入伪造价格。
6. 如已有旧文件，抓取失败时保留旧文件并在日志中记录失败，不要清空。
7. 写入完成后先验证 JSON 可以解析。
8. `category`、`date`、`source`、`url`、`summary` 会被行业供需和资讯板块直接读取，尽量填写完整。
9. `change_pct` 没有可靠数据时使用 `null`，不要补造成 `0`。

```powershell
& $PY -m json.tool data\external_market.json > $null
if ($LASTEXITCODE -ne 0) { throw "external_market.json 不是有效 JSON" }
```

### 4.1 比赛页面联动规则

比赛精简版的“原料行情”默认展示 3 张重点卡：

- `布伦特原油`
- `乙烯`
- `苯乙烯`

其他原料会按涨跌幅绝对值进入“其他关注”。为确保页面稳定，WorkBuddy 还应尽量维护以下优先品种：

```text
布伦特原油、乙烯、苯乙烯、丙烯、甲醇、乙二醇、棕榈油、丙烯酸、液碱、十二烷基苯磺酸钠
```

注意：

1. 页面不会直接读取 `external_market.json`，而是读取 `generate_data.py` 合并后的 `data/dashboard_data.json`。所以写完行情后必须重新执行生成脚本。
2. 7 天走势由前端根据 `price` 和 `change_pct` 动态计算，WorkBuddy 不需要写入 forecast 字段。
3. `price` 必须使用最新有效价格；`change_pct` 使用百分数数值，例如 `-3.45` 表示 -3.45%。
4. 无法确认的 `change_pct` 可以写 `null`，页面会按横盘展示，但不能伪造。
5. 重点品种名称必须与上面完全一致；改名后卡片会消失或进入备用排序。
6. `unit` 必须与价格口径一致，例如 `元/吨` 或 `美元/桶`。

写入完成后执行页面契约校验：

```powershell
& $PY scripts\validate_external_market.py --input data\external_market.json --strict-featured
if ($LASTEXITCODE -ne 0) { throw "外部行情页面契约校验失败" }
```

## 5. 动作二：生成并校验 dashboard_data.json

推荐 WorkBuddy 使用统一入口，一次完成 SAP 抓取、翻译、脱敏、生成和校验：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "D:\Users\22614\Documents\供应链平台\scripts\run_sap_pipeline.ps1" -MaskMode 部分
if ($LASTEXITCODE -ne 0) { throw "SAP → JSON 流水线失败，停止发布" }
```

以下为分步执行方式，用于排查问题：

```powershell
& $PY scripts\generate_data.py --mode competition
if ($LASTEXITCODE -ne 0) { throw "generate_data.py 执行失败" }

& $PY scripts\validate_dashboard_data.py --mode competition
if ($LASTEXITCODE -ne 0) { throw "dashboard_data.json 安全校验失败，停止发布" }
```

校验至少覆盖：

- 顶层 JSON 结构和关键字段。
- 比赛模式、脱敏标识、kg 单位。
- 工厂只能为 1501。
- 物料、行动、仓储数据不得出现 1160。
- 供应商和物料描述必须保持部分脱敏。
- 不允许绝对路径、密钥字段和内部版生产数据。
- 数量统计必须与数组实际长度一致。
- 可选 baseline 对比，防止数据异常骤降。

如需对比上一版：

```powershell
& $PY scripts\validate_dashboard_data.py --mode competition --baseline data\previous_dashboard_data.json
```

## 6. 动作三：一键生成、校验、提交和推送

> 可直接交给 WorkBuddy 的完整提示词：`delivery_templates\WorkBuddy第一阶段一键提示词.md`

第一阶段自动化只需要 WorkBuddy 完成外部行情 JSON，然后执行一个总控脚本。

先同步远端：

```powershell
Set-Location "D:\Users\22614\Documents\供应链平台"
git pull --rebase origin main
if ($LASTEXITCODE -ne 0) { throw "git pull --rebase 失败，停止本次任务" }
```

WorkBuddy 写入并保存 `data\external_market.json` 后执行：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "D:\Users\22614\Documents\供应链平台\scripts\run_daily_automation.ps1"

> WorkBuddy 工具超时必须设置为至少 10 分钟（600000 ms）。总控脚本的 git push 首次失败后会自动等待 5 秒并重试 1 次。
if ($LASTEXITCODE -ne 0) { throw "每日自动化失败，停止发布并发送告警" }
```

总控脚本会自动完成：

```text
外部行情时效与字段校验
→ SAP ZWM002 / ME2L / MB51 抓取
→ 三路抓取状态门禁
→ 翻译与部分脱敏
→ dashboard_data.json / dashboard_data.js 生成
→ 看板安全校验与基线校验
→ 构建分享版
→ 只暂存公开数据文件
→ git commit
→ git push origin main
→ 写入运行报告
```

运行报告位置：

```text
%TEMP%\SAPRadar_outputs\daily_run_latest.json
```

WorkBuddy 只在脚本退出码为 `0` 且运行报告 `status=ok` 时报告成功。

### 手工排查模式

以下命令只在总控脚本失败、需要定位问题时使用。

> 当前目录已初始化 Git，并绑定远程仓库：
>
> ```text
> origin = https://github.com/Xiejiananaa/Xiejiananaa.github.io.git
> branch = main
> ```
>
> 日常自动任务只能提交数据白名单，禁止执行 `git add .` 或 `git add data/`。

```powershell
git add -- data\external_market.json data\dashboard_data.json data\dashboard_data.js
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

推送失败时最多重试 3 次，不允许强制推送，不覆盖远端提交。

第一阶段正式入口固定为 `scripts\run_daily_automation.ps1`；WorkBuddy 不再自行拼接 SAP、校验、提交和推送步骤。
## 7. 比赛演示入口

不需要在评委面前打开 PowerShell。直接打开：

```text
https://xiejiananaa.github.io/?route=ai/workbuddy
```

该页面展示 WorkBuddy 的最近运行时间、SAP 抓取链路、JSON 编译、安全校验、GitHub Actions 和发布证据。

## 8. GitHub Pages 自动部署

工作流文件：

```text
.github\workflows\deploy-pages.yml
```

首次启用时，在 GitHub 仓库的 **Settings → Pages → Build and deployment** 中将 Source 选择为 **GitHub Actions**。

触发条件：

- `data/dashboard_data.json`、页面代码或工作流发生变化。
- 手动 `workflow_dispatch`。

部署流程：

1. 校验 `data/dashboard_data.json`。
2. 重新生成单文件分享版。
3. 只将公开白名单文件放入发布目录。
4. 部署到 GitHub Pages。

发布目录只包含：

```text
index.html
.nojekyll
assets/
data/dashboard_data.json
dist/供应雷达-分享讨论版.html
```

不得把 `data/internal/`、Excel、日志或密钥放入发布目录。

## 9. 单文件分享版

日常自动更新不需要提交 `dist` 目录，避免每天提交约 2 MB 的 HTML。

在比赛、演示或正式分享前执行：

```powershell
& $PY scripts\build_share_html.py
```

生成：

```text
dist\供应雷达-分享讨论版.html
```

单文件版内嵌同一份 `data/dashboard_data.json`，可双击打开，也可以打包成 ZIP 分享。

## 10. 内部版规则

内部版只在受控本地目录使用：

```powershell
& $PY scripts\generate_data.py --mode internal
& $PY scripts\validate_dashboard_data.py --mode internal --input data\internal\dashboard_data.json
```

内部版可以包含全部工厂和 1160 数据，但：

- 不得推送公开 GitHub。
- 不得进入 GitHub Pages 发布目录。
- 不得生成公开分享 HTML。
- 不得被 WorkBuddy 的公开发布任务自动覆盖。

## 11. 失败重试和停止条件

### 可以重试

- 外部行情抓取失败：最多 3 次。
- `git pull` 冲突或网络失败：最多 3 次。
- GitHub 推送失败：最多 3 次。

### 必须停止

- 输入 Excel 缺失或无法读取。
- `generate_data.py` 返回非 0。
- 数据校验返回非 0。
- 出现 1160、未脱敏供应商、内部路径或内部版生产数据。
- Git 冲突无法自动解决。
- 连续 3 次推送失败。

停止时保留上一版可用 JSON，发送失败通知，不执行强制推送。

## 12. 无推送演练

首次启用前执行：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "scripts\run_daily_automation.ps1" -CheckOnly
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "scripts\run_daily_automation.ps1" -SkipPush
```

第一条只检查路径、行情契约和运行环境；第二条执行完整生成、校验和本地提交，但不推送远端。

演练后检查：

```text
%TEMP%\SAPRadar_outputs\daily_run_latest.json
```