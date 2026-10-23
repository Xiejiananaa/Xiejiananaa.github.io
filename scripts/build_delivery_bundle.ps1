[CmdletBinding()]
param(
  [string]$SapRoot = "D:\Users\22614\Documents\供应雷达",
  [string]$PlatformRoot = "D:\Users\22614\Documents\供应链平台",
  [string]$DestinationRoot = "D:\Users\22614\Documents",
  [string]$BundleName = ""
)

$ErrorActionPreference = "Stop"
$utf8 = New-Object System.Text.UTF8Encoding($false)

function Assert-Path([string]$Path, [string]$Label) {
  if (-not (Test-Path -LiteralPath $Path)) { throw "$Label 不存在：$Path" }
}

function Copy-RequiredFile([string]$Source, [string]$Destination) {
  if (-not (Test-Path -LiteralPath $Source -PathType Leaf)) { throw "缺少文件：$Source" }
  $parent = Split-Path -Parent $Destination
  if (-not (Test-Path -LiteralPath $parent)) { New-Item -ItemType Directory -Path $parent -Force | Out-Null }
  Copy-Item -LiteralPath $Source -Destination $Destination -Force
}

function Write-Utf8([string]$Path, [string]$Text) {
  $parent = Split-Path -Parent $Path
  if (-not (Test-Path -LiteralPath $parent)) { New-Item -ItemType Directory -Path $parent -Force | Out-Null }
  [IO.File]::WriteAllText($Path, $Text, $utf8)
}

Assert-Path $SapRoot "SAP 自动抓取项目"
Assert-Path $PlatformRoot "供应链可视化平台"
Assert-Path $DestinationRoot "交付包输出目录"

$stamp = Get-Date -Format "yyyyMMdd_HHmmss"
if ([string]::IsNullOrWhiteSpace($BundleName)) { $BundleName = "供应链数智化工作台_正式交付包_$stamp" }
$BundleRoot = Join-Path $DestinationRoot $BundleName
$ZipPath = "$BundleRoot.zip"
if (Test-Path -LiteralPath $BundleRoot) { throw "目标目录已存在，请换一个 BundleName：$BundleRoot" }
if (Test-Path -LiteralPath $ZipPath) { throw "目标压缩包已存在：$ZipPath" }

$Dirs = @(
  "00_一键入口",
  "01_SAP自动抓取与数据生成\scripts",
  "01_SAP自动抓取与数据生成\assets",
  "01_SAP自动抓取与数据生成\docs",
  "02_供应链可视化平台\assets",
  "02_供应链可视化平台\assets\fonts",
  "02_供应链可视化平台\data",
  "02_供应链可视化平台\scripts",
  "02_供应链可视化平台\worker",
  "02_供应链可视化平台\.github\workflows",
  "02_供应链可视化平台\dist",
  "03_WorkBuddy协同",
  "04_离线交付",
  "05_文档与变更记录"
)
foreach ($dir in $Dirs) { New-Item -ItemType Directory -Path (Join-Path $BundleRoot $dir) -Force | Out-Null }

# 总 README
Copy-RequiredFile (Join-Path $PlatformRoot "README_正式交付总览.md") (Join-Path $BundleRoot "README.md")

# 中文一键入口
Get-ChildItem -LiteralPath (Join-Path $PlatformRoot "delivery_templates\00_一键入口") -File | ForEach-Object {
  Copy-RequiredFile $_.FullName (Join-Path $BundleRoot "00_一键入口\$($_.Name)")
}

# 项目一：SAP 自动抓取
$SapProject = Join-Path $BundleRoot "01_SAP自动抓取与数据生成"
@("README.md","run_pipeline.py","config.py","requirements.txt",".env.example","run_pipeline.bat","desensitize_latest.bat","discover_me2l_mb51.bat","discover_results_me2l_mb51.bat","finalize_mb51_merge.bat","test_export_me2l_mb51.bat") | ForEach-Object {
  Copy-RequiredFile (Join-Path $SapRoot $_) (Join-Path $SapProject $_)
}
Get-ChildItem -LiteralPath (Join-Path $SapRoot "scripts") -File -Filter "*.py" | ForEach-Object {
  Copy-RequiredFile $_.FullName (Join-Path $SapProject "scripts\$($_.Name)")
}
Get-ChildItem -LiteralPath (Join-Path $SapRoot "assets") -File | ForEach-Object {
  Copy-RequiredFile $_.FullName (Join-Path $SapProject "assets\$($_.Name)")
}
@("PROJECT_PROGRESS.md","SAP抓取升级方案_20261020.md","供应表格升级总结_20261019.md") | ForEach-Object {
  Copy-RequiredFile (Join-Path $SapRoot $_) (Join-Path $SapProject "docs\$_")
}
Copy-RequiredFile (Join-Path $PlatformRoot "delivery_templates\供应雷达_脚本功能索引.md") (Join-Path $SapProject "脚本功能索引.md")

# 项目二：供应链可视化平台
$PlatformProject = Join-Path $BundleRoot "02_供应链可视化平台"
@("README.md","WORKBUDDY_GUIDE.md","TASKS.md","index.html","requirements.txt","wrangler.jsonc",".nojekyll") | ForEach-Object {
  Copy-RequiredFile (Join-Path $PlatformRoot $_) (Join-Path $PlatformProject $_)
}
@("dashboard_data.json","dashboard_data.js","external_market.json","external_market.example.json") | ForEach-Object {
  Copy-RequiredFile (Join-Path $PlatformRoot "data\$_") (Join-Path $PlatformProject "data\$_")
}
Get-ChildItem -LiteralPath (Join-Path $PlatformRoot "assets") -File | ForEach-Object {
  Copy-RequiredFile $_.FullName (Join-Path $PlatformProject "assets\$($_.Name)")
}
Get-ChildItem -LiteralPath (Join-Path $PlatformRoot "assets\fonts") -File | ForEach-Object {
  Copy-RequiredFile $_.FullName (Join-Path $PlatformProject "assets\fonts\$($_.Name)")
}
@("run_sap_pipeline.ps1","generate_data.py","validate_dashboard_data.py","build_share_html.py","build_cloudflare_site.mjs","supplier_region.py","脚本功能索引.md") | ForEach-Object {
  Copy-RequiredFile (Join-Path $PlatformRoot "scripts\$_") (Join-Path $PlatformProject "scripts\$_")
}
Copy-RequiredFile (Join-Path $PlatformRoot "worker\index.js") (Join-Path $PlatformProject "worker\index.js")
Copy-RequiredFile (Join-Path $PlatformRoot ".github\workflows\deploy-pages.yml") (Join-Path $PlatformProject ".github\workflows\deploy-pages.yml")
Copy-RequiredFile (Join-Path $PlatformRoot "dist\供应雷达-分享讨论版.html") (Join-Path $PlatformProject "dist\供应雷达-分享讨论版.html")
Copy-RequiredFile (Join-Path $PlatformRoot "dist\供应雷达-分享讨论版.html") (Join-Path $BundleRoot "04_离线交付\供应雷达-分享讨论版.html")

# WorkBuddy 协同
Copy-RequiredFile (Join-Path $PlatformRoot "WORKBUDDY_GUIDE.md") (Join-Path $BundleRoot "03_WorkBuddy协同\WORKBUDDY_GUIDE.md")
Copy-RequiredFile (Join-Path $PlatformRoot "delivery_templates\WorkBuddy每日执行清单.md") (Join-Path $BundleRoot "03_WorkBuddy协同\每日执行清单.md")

# 文档归档
@("竞品借鉴分析.md","页面改造方案.md") | ForEach-Object {
  $src = Join-Path $PlatformRoot $_
  if (Test-Path -LiteralPath $src) { Copy-RequiredFile $src (Join-Path $BundleRoot "05_文档与变更记录\$_") }
}
$VersionNote = "# 版本说明`r`n`r`n- 交付包生成时间：$stamp`r`n- 页面视觉：V3 暖纸灰 + 墨蓝 + 陶土色阶`r`n- 导航：深海军蓝 + 青蓝激活态`r`n- 字体：本地 Inter 可变字体`r`n- 数据模式：competition（工厂 1501、kg、部分脱敏）`r`n- 页面源码：$PlatformRoot`r`n- SAP 自动化源码：$SapRoot`r`n`r`n说明：交付包不包含 `.env`、`.venv`、原始 Excel、内部数据、日志、缓存和 `vendor`。`r`n"
Write-Utf8 (Join-Path $BundleRoot "05_文档与变更记录\版本说明.md") $VersionNote

Compress-Archive -LiteralPath $BundleRoot -DestinationPath $ZipPath -CompressionLevel Optimal
Write-Host "交付目录：$BundleRoot"
Write-Host "压缩包：$ZipPath"
Write-Host "压缩包大小：$([Math]::Round((Get-Item -LiteralPath $ZipPath).Length / 1MB, 2)) MB"