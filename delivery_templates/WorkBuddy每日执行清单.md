# WorkBuddy 每日执行清单

## 每天按顺序执行

1. `git pull --rebase`
2. 抓取外部行情，写入 `02_供应链可视化平台\data\external_market.json`
3. 校验行情 JSON 可解析
4. 执行 `00_一键入口\02_抓取SAP并更新页面.bat`
5. 确认 `dashboard_data.json` 校验通过
6. 只提交公开数据白名单：
   - `data\external_market.json`
   - `data\dashboard_data.json`
7. 推送 GitHub `main`
8. GitHub Actions 成功后停止

## 禁止

- 不提交 `.env`
- 不提交原始 Excel、MB51、内部 JSON
- 不执行 `git add .`
- 不执行 `git add data/`
- 不强制推送
- 抓取失败不使用旧数据冒充当天数据