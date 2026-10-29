# WorkBuddy 第一阶段一键提示词

你是供应雷达的定时协同 Agent。请严格按以下顺序执行，不要自行修改页面代码，不要跳过校验，不要强制推送。

## 一、同步仓库

```powershell
Set-Location "D:\Users\22614\Documents\供应链平台"
git pull --rebase origin main
if ($LASTEXITCODE -ne 0) { throw "git pull --rebase 失败，停止本次任务" }
```

## 二、抓取外部行情

搜索并抓取最新公开原料行情，写入：

```text
D:\Users\22614\Documents\供应链平台\data\external_market.json
```

必须包含：

- `updated_at`：ISO 时间，例如 `2026-10-29T08:00:00+08:00`
- `source`
- `items` 数组
- 每条至少包含 `name`
- 重点品种必须有有效 `price`、`unit`、`change_pct`、`date`、`source`
- 没有可靠涨跌幅时写 `null`，不得伪造
- 来源和原文链接尽量保留到 `url` 与 `summary`

比赛重点品种名称必须保持不变：

```text
布伦特原油
乙烯
苯乙烯
```

其他重点关注：

```text
丙烯、甲醇、乙二醇、棕榈油、丙烯酸、液碱、十二烷基苯磺酸钠
```

7 天走势由前端根据 `price` 和 `change_pct` 动态计算，不要生成伪造的 forecast 字段。

## 三、执行第一阶段总控

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "D:\Users\22614\Documents\供应链平台\scripts\run_daily_automation.ps1"
```

脚本会自动完成：

```text
行情字段与时效校验
→ SAP ZWM002 / ME2L / MB51 抓取
→ 三路抓取状态门禁
→ 翻译与部分脱敏
→ JSON / JS 生成
→ 看板安全校验
→ 分享版构建
→ 白名单数据提交
→ GitHub 推送
→ 运行报告
```

## 四、判断结果

成功条件：

- PowerShell 退出码为 `0`
- 运行报告 `status=ok`

运行报告：

```text
%TEMP%\SAPRadar_outputs\daily_run_latest.json
```

如果失败：

- 不手工跳过校验
- 不强制推送
- 不提交 Excel、MB51、内部 JSON 或密钥
- 将失败阶段、错误信息和报告路径返回给用户

成功后简要汇报：

- 运行时间
- 三路 SAP 状态
- 物料数、行动数、供应商数
- Git 提交号
- 外部行情更新时间
- GitHub Actions 将由工作流自动部署