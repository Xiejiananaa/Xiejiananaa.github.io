# WorkBuddy 每日执行清单

> 配套一键提示词：`WorkBuddy第一阶段一键提示词.md`

## 每天按顺序执行

1. 同步 GitHub：
   `git pull --rebase origin main`
2. 抓取外部行情，写入 `02_供应链可视化平台\data\external_market.json`
3. 确保已填写 `updated_at`、`price`、`unit`、`change_pct`、`date`、`source`
4. 执行第一阶段一键总控：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "02_供应链可视化平台\scripts\run_daily_automation.ps1"

> 工具超时请设置为至少 10 分钟（600000 ms）。push 首次失败会自动等待 5 秒重试 1 次。
```

5. 检查脚本退出码必须为 `0`
6. 检查运行报告：
   `%TEMP%\SAPRadar_outputs\daily_run_latest.json`
7. 报告 `status=ok` 后任务结束
8. GitHub Actions 自动部署页面

## 一键总控自动完成

- 外部行情契约与时效校验
- ZWM002 / ME2L / MB51 抓取
- 三路抓取状态门禁
- 翻译与部分脱敏
- JSON / JS 数据生成
- 看板安全校验与基线校验
- 分享版构建
- 数据白名单提交
- GitHub 推送
- 运行报告写入

## 比赛精简版重点品种

必须保持以下名称不变，并保证价格有效：

- `布伦特原油`
- `乙烯`
- `苯乙烯`

其他优先品种：

`丙烯、甲醇、乙二醇、棕榈油、丙烯酸、液碱、十二烷基苯磺酸钠`

7 天走势由前端根据 `price` 和 `change_pct` 计算，不要额外伪造 forecast 字段。

## 禁止

- 不提交 `.env`
- 不提交原始 Excel、MB51、内部 JSON
- 不执行 `git add .`
- 不执行 `git add data/`
- 不强制推送
- 每日任务失败时不要手工跳过校验继续发布