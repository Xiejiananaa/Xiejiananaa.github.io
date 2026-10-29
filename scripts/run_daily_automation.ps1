[CmdletBinding()]
param(
  [string]$ProjectRoot = "D:\Users\22614\Documents\供应链平台",
  [string]$SapRoot = "D:\Users\22614\Documents\供应雷达",
  [string]$Python = "D:\Users\22614\Documents\供应雷达\.venv\Scripts\python.exe",
  [string]$SapPython = "D:\Users\22614\Documents\供应雷达\.venv\Scripts\python.exe",
  [ValidateSet("部分", "原样", "完全")]
  [string]$MaskMode = "部分",
  [string]$Branch = "main",
  [double]$ExternalMaxAgeHours = 48,
  [double]$MaxDropPct = 40,
  [switch]$SkipSapFetch,
  [switch]$SkipPush,
  [switch]$CheckOnly
)

$ErrorActionPreference = "Stop"
$env:PYTHONUTF8 = "1"
$env:PYTHONIOENCODING = "utf-8"
$runStarted = Get-Date
$runId = $runStarted.ToString("yyyyMMdd_HHmmss")
$runtimeRoot = if ($env:SAPRADAR_OUTPUT_DIR) {
  [IO.Path]::GetFullPath($env:SAPRADAR_OUTPUT_DIR)
} else {
  Join-Path $env:TEMP "SAPRadar_outputs"
}
$reportPath = Join-Path $runtimeRoot "daily_run_latest.json"
$baselinePath = Join-Path $runtimeRoot "daily_baseline_$runId.json"
$lockPath = Join-Path $runtimeRoot "daily_run.lock"
$lockStream = $null
$lockAcquired = $false
$report = [ordered]@{
  run_id = $runId
  status = "running"
  stage = "init"
  started_at = $runStarted.ToString("yyyy-MM-dd HH:mm:ss")
  finished_at = $null
  project_root = $ProjectRoot
  sap_root = $SapRoot
  mask_mode = $MaskMode
  branch = $Branch
  external_max_age_hours = $ExternalMaxAgeHours
  git_commit = $null
  message = ""
}

function Save-RunReport {
  if (-not (Test-Path -LiteralPath $runtimeRoot)) {
    New-Item -ItemType Directory -Path $runtimeRoot -Force | Out-Null
  }
  $report.finished_at = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
  [IO.File]::WriteAllText($reportPath, ($report | ConvertTo-Json -Depth 8), (New-Object System.Text.UTF8Encoding($false)))
}

function Assert-File([string]$Path, [string]$Label) {
  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { throw "$Label 不存在：$Path" }
}

function Assert-Directory([string]$Path, [string]$Label) {
  if (-not (Test-Path -LiteralPath $Path -PathType Container)) { throw "$Label 不存在：$Path" }
}

function Invoke-Checked([string]$Label, [scriptblock]$Action) {
  & $Action
  if ($LASTEXITCODE -ne 0) { throw "$Label 失败，退出码：$LASTEXITCODE" }
}

function Get-DirtyPaths {
  $lines = @(& git status --porcelain --untracked-files=all)
  if ($LASTEXITCODE -ne 0) { throw "读取 Git 状态失败" }
  return @($lines | Where-Object { $_ } | ForEach-Object { $_.Substring(3).Trim('"') })
}

function Assert-AllowedChanges([string[]]$Paths) {
  $allowed = @(
    "data/external_market.json",
    "data/dashboard_data.json",
    "data/dashboard_data.js"
  )
  $unexpected = @($Paths | Where-Object { $_ -and ($allowed -notcontains $_) })
  if ($unexpected.Count -gt 0) {
    throw "发现未允许的本地改动，停止发布：" + ($unexpected -join ", ")
  }
}

try {
  if (-not $CheckOnly) {
    if (-not (Test-Path -LiteralPath $runtimeRoot)) { New-Item -ItemType Directory -Path $runtimeRoot -Force | Out-Null }
    try {
      $lockStream = [IO.File]::Open($lockPath, [IO.FileMode]::CreateNew, [IO.FileAccess]::ReadWrite, [IO.FileShare]::None)
      $lockAcquired = $true
      $lockBytes = [Text.Encoding]::UTF8.GetBytes("run_id=$runId`r`nstarted_at=$($report.started_at)`r`npid=$PID`r`n")
      $lockStream.Write($lockBytes, 0, $lockBytes.Length)
      $lockStream.Flush()
    } catch {
      throw "已有每日自动化任务正在运行，或存在未清理的锁文件：$lockPath"
    }
  }

  Assert-Directory $ProjectRoot "供应链平台目录"
  Assert-Directory $SapRoot "SAP 自动化目录"
  Assert-File $Python "平台 Python"
  Assert-File $SapPython "SAP Python"
  Assert-File (Join-Path $ProjectRoot "scripts\validate_external_market.py") "外部行情校验脚本"
  Assert-File (Join-Path $ProjectRoot "scripts\run_sap_pipeline.ps1") "SAP 总控脚本"
  Assert-File (Join-Path $ProjectRoot "scripts\validate_dashboard_data.py") "看板数据校验脚本"
  Set-Location $ProjectRoot

  $report.stage = "preflight"$lockPath = Join-Path $runtimeRoot "daily_run.lock"
$lockStream = $null
$lockAcquired = $false

  $dirtyPaths = @(Get-DirtyPaths)
  if ($CheckOnly) {
    if ($dirtyPaths.Count -gt 0) {
      Write-Host "[CHECK] 当前工作区存在未提交文件；仅做检查，不执行发布：" (($dirtyPaths | Select-Object -First 10) -join ", ")
    }
  } else {
    Assert-AllowedChanges $dirtyPaths
  }

  if ($CheckOnly) {
    Write-Host "[1/7] 检查模式：跳过 Git 同步"
  } elseif ($dirtyPaths.Count -eq 0) {
    Write-Host "[1/7] 工作区干净，正在同步 origin/$Branch ..."
    Invoke-Checked "git pull --rebase" { git pull --rebase origin $Branch }
  } else {
    Write-Host "[1/7] 检测到 WorkBuddy 已写入待发布数据，跳过自动拉取；请确保 WorkBuddy 已先执行 git pull。"
  }

  $externalPath = Join-Path $ProjectRoot "data\external_market.json"
  Assert-File $externalPath "外部行情文件"
  Write-Host "[2/7] 校验外部行情契约和时效..."
  $validatorArgs = @(
    "scripts\validate_external_market.py",
    "--input", "data\external_market.json",
    "--strict-featured"
  )
  if ($ExternalMaxAgeHours -gt 0) {
    $validatorArgs += @("--max-age-hours", $ExternalMaxAgeHours)
  }
  Invoke-Checked "外部行情契约校验" { & $Python @validatorArgs }

  if ($CheckOnly) {
    $report.status = "ok"
    $report.stage = "check_only"
    $report.message = "环境检查通过；未执行 SAP、生成或发布"
    Save-RunReport
    Write-Host "[CHECK] 第一阶段总控脚本检查通过"
    exit 0
  }

  $report.stage = "sap_pipeline"
  Write-Host "[3/7] 执行 SAP 抓取、翻译、脱敏、JSON 生成、安全校验和分享版构建..."
  $pipelineArgs = @(
    "-NoProfile",
    "-ExecutionPolicy", "Bypass",
    "-File", (Join-Path $ProjectRoot "scripts\run_sap_pipeline.ps1"),
    "-MaskMode", $MaskMode,
    "-SapRoot", $SapRoot,
    "-ProjectRoot", $ProjectRoot,
    "-Python", $Python,
    "-SapPython", $SapPython,
    "-BuildShare"
  )
  if ($SkipSapFetch) { $pipelineArgs += "-SkipSapFetch" }
  Invoke-Checked "SAP → JSON 流水线" { & powershell.exe @pipelineArgs }

  $report.stage = "source_gate"
  Write-Host "[4/7] 检查 ZWM002 / ME2L / MB51 三路抓取状态..."
  $manifestPath = Join-Path $runtimeRoot "fetch_manifest.json"
  Assert-File $manifestPath "SAP 抓取状态清单"
  $manifest = Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
  $sourceStatus = [ordered]@{}
  foreach ($profile in @("ZWM002", "ME2L", "MB51")) {
    $entry = $manifest.$profile
    if (-not $entry) { throw "SAP 状态清单缺少 $profile" }
    $sourceStatus[$profile] = [ordered]@{ status = $entry.status; time = $entry.time; rows = $entry.rows }
    if ($entry.status -ne "ok") {
      throw "SAP $profile 本次抓取未成功：$($entry.error)"
    }
  }
  $report.sources = $sourceStatus

  $report.stage = "baseline_validation"
  Write-Host "[5/7] 执行与上一版的基线校验..."
  $previousJson = @(& git show "HEAD:data/dashboard_data.json")
  if ($LASTEXITCODE -ne 0) { throw "读取上一版 dashboard_data.json 失败" }
  [IO.File]::WriteAllText($baselinePath, ($previousJson -join "`n"), (New-Object System.Text.UTF8Encoding($false)))
  Invoke-Checked "基线数据校验" {
    & $Python "scripts\validate_dashboard_data.py" --mode competition --baseline $baselinePath --max-drop-pct $MaxDropPct
  }

  $report.stage = "publish"
  $dirtyPaths = @(Get-DirtyPaths)
  Assert-AllowedChanges $dirtyPaths
  if ($dirtyPaths.Count -eq 0) {
    $report.status = "ok"
    $report.stage = "no_changes"
    $report.git_commit = (& git rev-parse --short HEAD)
    $report.message = "本次数据没有变化，无需提交"
    Save-RunReport
    Write-Host "[6/7] 数据没有变化，跳过提交"
    Write-Host "[7/7] 完成"
    exit 0
  }

  Write-Host "[6/7] 只暂存公开数据文件..."
  $publicFiles = @(
    "data\external_market.json",
    "data\dashboard_data.json",
    "data\dashboard_data.js"
  ) | Where-Object { Test-Path -LiteralPath (Join-Path $ProjectRoot $_) }
  Assert-AllowedChanges @($publicFiles | ForEach-Object { $_ -replace "\\", "/" })
  Invoke-Checked "git add 公开数据" { git add -- @publicFiles }
  Invoke-Checked "git commit" { git commit -m "每日更新数据 $((Get-Date).ToString('yyyy-MM-dd'))" }
  $report.git_commit = (& git rev-parse --short HEAD)

  if ($SkipPush) {
    $report.status = "ok"
    $report.stage = "ready_no_push"
    $report.message = "已完成生成、校验和本地提交；按参数跳过推送"
    Save-RunReport
    Write-Host "[7/7] 已按参数跳过推送"
    exit 0
  }

  Write-Host "[7/7] 推送 origin/$Branch ..."
  Invoke-Checked "git push" { git push origin $Branch }
  $report.status = "ok"
  $report.stage = "pushed"
  $report.message = "数据已提交并推送，等待 GitHub Actions 自动部署"
  Save-RunReport
  Write-Host "每日自动化完成"
  Write-Host "运行报告：$reportPath"
  exit 0
} catch {
  $report.status = "failed"
  $report.message = $_.Exception.Message
  Save-RunReport
  Write-Error $_
  Write-Host "失败报告：$reportPath"
  exit 1
} finally {
  if (Test-Path -LiteralPath $baselinePath) { Remove-Item -LiteralPath $baselinePath -Force -ErrorAction SilentlyContinue }
  if ($lockStream) { $lockStream.Dispose() }
  if ($lockAcquired -and (Test-Path -LiteralPath $lockPath)) { Remove-Item -LiteralPath $lockPath -Force -ErrorAction SilentlyContinue }
}