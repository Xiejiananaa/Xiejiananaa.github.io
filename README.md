# 供应雷达 · 供应链决策工作台

## 页面初版

- 暗色 SaaS 风格固定左侧手风琴导航：今日指挥中心、物料供需与保供、供应商与仓储、生产协同与动态沙盘、行业情报与市场洞察、AI智能协同
- 02–05 使用同页模块锚点，01 与 06 使用独立子页面
- AI 中心包含问答、任务执行、审批跟踪、决策依据、效果复盘
- 数据源：`data/dashboard_data.json`
- 比赛版默认加载部分脱敏、工厂 1501 数据
- 本地 AI 机器人：基于当前 JSON 的确定性问答，不依赖外网
- 不使用境外 CDN、Google Fonts 或在线地图服务

## 本地运行

> 不要直接双击 `index.html`。浏览器会拦截 `fetch()` 读取 JSON，必须通过 HTTP 地址打开。双击项目根目录的 `启动页面.bat` 即可。


```powershell
cd D:\Users\22614\Documents\供应链平台
python -m http.server 8765
```

打开：

```text
http://127.0.0.1:8765/
```

内部版预览：

```text
http://127.0.0.1:8765/?mode=internal
```

指定业务路由预览：

```text
http://127.0.0.1:8765/?route=supply/gap
http://127.0.0.1:8765/?route=production/plan
http://127.0.0.1:8765/?route=ai/tasks
```

AI 机器人预览：

```text
http://127.0.0.1:8765/?robot=1
http://127.0.0.1:8765/?robot=1&ask=今天最紧急的物料
```

## 分享给同事

直接把下面这个文件发给同事：

```text
dist/供应雷达-分享讨论版.html
```

- 单文件，约 2 MB
- 已内嵌部分脱敏 JSON、ECharts 和中国地图
- 同事双击即可打开，不需要 Python 或本地服务器
- 页面标注“分享讨论版 · 部分脱敏”
- 不包含内部版 1160 数据

重新构建分享版：

```powershell
python scripts/build_share_html.py
```

## WorkBuddy 每日发布

WorkBuddy 的完整执行说明见：

```text
WORKBUDDY_GUIDE.md
```

核心流程：

1. 抓取行情并写入 `data/external_market.json`
2. 执行 `python scripts/generate_data.py --mode competition`
3. 执行 `python scripts/validate_dashboard_data.py --mode competition`
4. 只提交 `data/external_market.json` 和 `data/dashboard_data.json`
5. 推送 GitHub，由 `.github/workflows/deploy-pages.yml` 校验并部署

数据校验会阻止 1160、内部版数据、未脱敏名称和错误口径进入公开发布流程。

## 一键更新比赛页面

双击：

```text
更新比赛页面.bat
```

它会自动：

1. 从 `%TEMP%\SAPRadar_outputs\desensitized` 读取最新的部分脱敏表
2. 生成 `data/dashboard_data.json`
3. 重新打包 `dist/供应雷达-分享讨论版.html`

然后双击 `启动页面.bat` 查看页面。

## 重新生成数据

比赛版：

```powershell
python scripts/generate_data.py --mode competition
```

内部版：

```powershell
python scripts/generate_data.py --mode internal
```

输入自动优先级：

1. `--input`
2. `SUPPLY_INPUT`
3. `data/inventory_report_test.xlsx`
4. 相邻项目的总表18
5. `data/*总表*.xlsx`

## 文件结构

```text
index.html              页面骨架
assets/styles.css       视觉系统与响应式样式
assets/app.js           数据加载、图表、表格、抽屉与 AI 机器人
assets/echarts.min.js   本地 ECharts
assets/china.geo.json   本地中国地图
data/dashboard_data.json          比赛脱敏版
data/internal/dashboard_data.json 内部版，不提交
scripts/generate_data.py          数据生成入口
preview/                          初版页面截图
TASKS.md                          任务清单
```
