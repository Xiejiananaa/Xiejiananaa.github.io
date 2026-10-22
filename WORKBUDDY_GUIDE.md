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
      "name": "环氧乙烷",
      "category": "基础化工",
      "price": 6500,
      "unit": "元/吨",
      "change_pct": 1.2,
      "change": 78,
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

## 6. 动作三：提交和推送

> 当前目录已初始化 Git，并绑定远程仓库：
>
> ```text
> origin = https://github.com/Xiejiananaa/Xiejiananaa.github.io.git
> branch = main
> ```
>
> 日常自动任务只能提交数据白名单，禁止执行 `git add .` 或 `git add data/`。

```powershell
git pull --rebase
if ($LASTEXITCODE -ne 0) { throw "git pull --rebase 失败" }

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

推送失败时最多重试 3 次：

```text
git pull --rebase
git push origin main
```

连续 3 次失败后停止，不强制推送，不覆盖远端提交。

## 7. GitHub Pages 自动部署

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

## 8. 单文件分享版

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

## 9. 内部版规则

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

## 10. 失败重试和停止条件

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

## 11. 无提交演练

首次启用前执行：

```powershell
& $PY scripts\generate_data.py --mode competition
& $PY scripts\validate_dashboard_data.py --mode competition
& $PY scripts\build_share_html.py
git diff -- data\dashboard_data.json data\external_market.json
```

确认无误后再启用定时任务。