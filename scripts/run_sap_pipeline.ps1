[CmdletBinding()]
param(
  [string]$SapRoot = "D:\Users\22614\Documents\供应雷达",
  [string]$SapPython = "D:\Users\22614\Documents\供应雷达\.venv\Scripts\python.exe",
  [string]$ProjectRoot = "D:\Users\22614\Documents\供应链平台",
  [string]$Python = "D:\Users\22614\Documents\供应雷达\.venv\Scripts\python.exe",
  [ValidateSet("部分", "原样", "完全")]
  [string]$MaskMode = "部分",
  [string]$FetchProfiles = "ZWM002,ME2L,MB51",
  [switch]$SkipSapFetch,
  [switch]$BuildShare,
  [switch]$CheckOnly
)

$ErrorActionPreference = "Stop"
$env:PYTHONUTF8 = "1"
$env:PYTHONIOENCODING = "utf-8"

function Assert-File([string]$Path, [string]$Label) {
  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
    throw "$Label 不存在：$Path"
  }
}

function Assert-Directory([string]$Path, [string]$Label) {
  if (-not (Test-Path -LiteralPath $Path -PathType Container)) {
    throw "$Label 不存在：$Path"
  }
}

function Invoke-Checked([string]$Label, [scriptblock]$Action) {
  & $Action
  if ($LASTEXITCODE -ne 0) {
    throw "$Label 失败，退出码：$LASTEXITCODE"
  }
}

Assert-Directory $SapRoot "SAP 自动化目录"
Assert-File (Join-Path $SapRoot "run_pipeline.py") "SAP 总控脚本"
Assert-File $SapPython "SAP Python"
Assert-Directory $ProjectRoot "供应链平台目录"
Assert-File (Join-Path $ProjectRoot "scripts\generate_data.py") "数据生成脚本"
Assert-File (Join-Path $ProjectRoot "scripts\validate_dashboard_data.py") "数据校验脚本"
Assert-File $Python "供应链平台 Python"

if ($CheckOnly) {
  Write-Host "[CHECK] SAP root: $SapRoot"
  Write-Host "[CHECK] Project root: $ProjectRoot"
  Write-Host "[CHECK] SAP profiles: $FetchProfiles"
  Write-Host "[CHECK] Mask mode: $MaskMode"
  if (-not $SkipSapFetch) {
    Push-Location $SapRoot
    try {
      & $SapPython "run_pipeline.py" --check
      if ($LASTEXITCODE -ne 0) { throw "SAP 总控环境检查失败，退出码：$LASTEXITCODE" }
    } finally {
      Pop-Location
    }
  }
  Write-Host "[CHECK] 路径检查通过"
  exit 0
}

if (-not $SkipSapFetch) {
  Push-Location $SapRoot
  try {
    Write-Host "[1/4] 正在抓取 SAP 库存、ME2L 和 MB51，并执行翻译与部分脱敏..."
    Invoke-Checked "SAP 自动化流水线" {
      & $SapPython "run_pipeline.py" --mask-mode $MaskMode --fetch-profiles $FetchProfiles
    }
  } finally {
    Pop-Location
  }
} else {
  Write-Host "[1/4] 已跳过 SAP 抓取，使用现有脱敏工作簿"
}

$runtimeRoot = if ($env:SAPRADAR_OUTPUT_DIR) {
  [IO.Path]::GetFullPath($env:SAPRADAR_OUTPUT_DIR)
} else {
  Join-Path $env:TEMP "SAPRadar_outputs"
}
$maskedDir = Join-Path $runtimeRoot "desensitized"
Assert-Directory $maskedDir "脱敏输出目录"

$pattern = switch ($MaskMode) {
  "部分" { "供应雷达-本地版_脱敏_部分_*.xlsx" }
  "原样" { "供应雷达-本地版_脱敏_原样_*.xlsx" }
  "完全" { "供应雷达-本地版_脱敏_完全_*.xlsx" }
}
$masked = Get-ChildItem -LiteralPath $maskedDir -Filter $pattern -File |
  Sort-Object LastWriteTime -Descending |
  Select-Object -First 1
if (-not $masked) {
  throw "未找到 $MaskMode 脱敏工作簿：$maskedDir\$pattern"
}
Write-Host "[2/4] 输入工作簿：$($masked.FullName)"

Set-Location $ProjectRoot
Invoke-Checked "生成 dashboard_data.json" {
  & $Python "scripts\generate_data.py" --mode competition --input $masked.FullName
}
Write-Host "[3/4] 正在执行公开数据安全校验..."
Invoke-Checked "校验 dashboard_data.json" {
  & $Python "scripts\validate_dashboard_data.py" --mode competition
}

if ($BuildShare) {
  Write-Host "[4/4] 正在构建离线分享版..."
  Invoke-Checked "构建离线分享版" {
    & $Python "scripts\build_share_html.py"
  }
} else {
  Write-Host "[4/4] 已跳过离线分享版构建"
}

$dashboard = Join-Path $ProjectRoot "data\dashboard_data.json"
Write-Host ""
Write-Host "SAP → JSON 完成"
Write-Host "脱敏工作簿：$($masked.FullName)"
Write-Host "dashboard_data：$dashboard"
Write-Host "下一步由 WorkBuddy 只提交以下两个数据文件并推送 GitHub。"