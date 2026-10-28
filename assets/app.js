'use strict';

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

const state = {
  data: null,
  mode: 'competition',
  activeView: 'overview',
  procurementMode: (new URLSearchParams(location.search).get('ptab') === 'replenish') ? 'replenish' : 'chase',
  actionFilter: 'all',
  actionSearch: '',
  supplierGroup: 'overall',
  supplierSearch: '',
  supplierRisk: '',
  gapMaterialKey: '',
  charts: {},
  megaTimer: null,
  closeTimer: null,
  megaView: null,
  mapReady: false,
  lastFocus: null,
};

const NAV_VIEWS = [
  'overview', 'today-focus', 'today-alerts', 'today-tasks',
  'procurement', 'supply', 'production', 'intelligence',
  'ai-workbuddy', 'ai-chat', 'ai-tasks', 'ai-approval', 'ai-evidence', 'ai-review',
];

const ROUTE_CONFIG = {
  'today/home': { view: 'overview', group: 'today', groupLabel: '今日指挥中心', label: '首页' },
  'today/focus': { view: 'today-focus', group: 'today', groupLabel: '今日指挥中心', label: '今日重点' },
  'today/alerts': { view: 'today-alerts', group: 'today', groupLabel: '今日指挥中心', label: '风险预警' },
  'today/tasks': { view: 'today-tasks', group: 'today', groupLabel: '今日指挥中心', label: '待办任务' },
  'supply/overview': { view: 'procurement', group: 'supply', groupLabel: '物料供需与保供', label: '供需总览', section: 'supply-overview' },
  'supply/gap': { view: 'procurement', group: 'supply', groupLabel: '物料供需与保供', label: '缺口测算', section: 'supply-gap' },
  'supply/safety': { view: 'procurement', group: 'supply', groupLabel: '物料供需与保供', label: '安全库存', section: 'supply-safety' },
  'supply/replenishment': { view: 'procurement', group: 'supply', groupLabel: '物料供需与保供', label: '补货建议', section: 'supply-replenishment', mode: 'replenish' },
  'supply/arrival': { view: 'procurement', group: 'supply', groupLabel: '物料供需与保供', label: '到货跟踪', section: 'supply-arrival', mode: 'chase' },
  'supplier/portrait': { view: 'supply', group: 'supplier', groupLabel: '供应商与仓储', label: '供应商画像', section: 'supplier-portrait' },
  'supplier/map': { view: 'supply', group: 'supplier', groupLabel: '供应商与仓储', label: '全国供应地图', section: 'supplier-map' },
  'supplier/delivery': { view: 'supply', group: 'supplier', groupLabel: '供应商与仓储', label: '交付绩效', section: 'supplier-delivery' },
  'supplier/inventory': { view: 'supply', group: 'supplier', groupLabel: '供应商与仓储', label: '库存分布', section: 'inventory-distribution' },
  'supplier/capital': { view: 'supply', group: 'supplier', groupLabel: '供应商与仓储', label: '资金与库龄', section: 'capital-aging' },
  'production/plan': { view: 'production', group: 'production', groupLabel: '生产协同与动态沙盘', label: '生产计划模拟', section: 'production-plan' },
  'production/demand': { view: 'production', group: 'production', groupLabel: '生产协同与动态沙盘', label: '物料需求重算', section: 'production-demand' },
  'production/replenishment': { view: 'production', group: 'production', groupLabel: '生产协同与动态沙盘', label: '补货推演', section: 'production-replenishment' },
  'production/compare': { view: 'production', group: 'production', groupLabel: '生产协同与动态沙盘', label: '保供方案比较', section: 'production-compare' },
  'intel/prices': { view: 'intelligence', group: 'intel', groupLabel: '行业情报与市场洞察', label: '原料行情', section: 'intel-prices' },
  'intel/industry': { view: 'intelligence', group: 'intel', groupLabel: '行业情报与市场洞察', label: '行业供需', section: 'intel-industry' },
  'intel/supplier-news': { view: 'intelligence', group: 'intel', groupLabel: '行业情报与市场洞察', label: '供应商动态', section: 'intel-supplier-news' },
  'ai/workbuddy': { view: 'ai-workbuddy', group: 'ai', groupLabel: 'AI智能协同', label: 'WorkBuddy 协同' },
  'ai/chat': { view: 'ai-chat', group: 'ai', groupLabel: 'AI智能协同', label: 'AI问答' },
  'ai/tasks': { view: 'ai-tasks', group: 'ai', groupLabel: 'AI智能协同', label: '任务执行' },
  'ai/approval': { view: 'ai-approval', group: 'ai', groupLabel: 'AI智能协同', label: '审批跟踪' },
  'ai/evidence': { view: 'ai-evidence', group: 'ai', groupLabel: 'AI智能协同', label: '决策依据' },
  'ai/review': { view: 'ai-review', group: 'ai', groupLabel: 'AI智能协同', label: '复盘分析' },
};

const VIEW_DEFAULT_ROUTE = {
  overview: 'today/home',
  'today-focus': 'today/focus',
  'today-alerts': 'today/alerts',
  'today-tasks': 'today/tasks',
  procurement: 'supply/overview',
  supply: 'supplier/portrait',
  production: 'production/plan',
  intelligence: 'intel/prices',
  'ai-chat': 'ai/chat',
  'ai-tasks': 'ai/tasks',
  'ai-approval': 'ai/approval',
  'ai-evidence': 'ai/evidence',
  'ai-review': 'ai/review',
};
const DIMENSION_LABELS = {
  inventory_low: '库存偏低',
  stockout_7d: '7天断供',
  supplier_otif: '供应商OTIF',
  arrival_exception: '到货异常',
  cost_pressure: '成本压力',
};

function esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function num(value, digits = 0) {
  if (value === null || value === undefined || value === '' || Number.isNaN(Number(value))) return '—';
  return Number(value).toLocaleString('zh-CN', { maximumFractionDigits: digits, minimumFractionDigits: 0 });
}

function compact(value, digits = 1) {
  if (value === null || value === undefined || value === '' || Number.isNaN(Number(value))) return '—';
  const n = Number(value);
  const abs = Math.abs(n);
  if (abs >= 100000000) return (n / 100000000).toFixed(2) + '亿';
  if (abs >= 10000) return (n / 10000).toFixed(digits) + '万';
  return num(n, digits);
}

function kg(value, digits = 1) {
  return compact(value, digits) + ' kg';
}

function money(value) {
  if (value === null || value === undefined) return '—';
  const n = Number(value);
  if (Math.abs(n) >= 100000000) return (n / 100000000).toFixed(2) + '亿元';
  if (Math.abs(n) >= 10000) return (n / 10000).toFixed(1) + '万元';
  return num(n, 0) + '元';
}

function pct(value, digits = 1) {
  if (value === null || value === undefined || value === '') return '—';
  return Number(value).toFixed(digits) + '%';
}

function dateText(value) {
  if (!value) return '—';
  return String(value).slice(0, 10);
}

function riskTone(value) {
  const text = String(value || '');
  if (text.includes('紧急') || text.includes('红')) return 'red';
  if (text.includes('关注') || text.includes('橙')) return 'orange';
  if (text.includes('正常') || text.includes('绿')) return 'green';
  if (text.includes('黄')) return 'amber';
  return 'muted';
}

function stripEmoji(value) {
  return String(value || '').replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{2B00}-\u{2BFF}]/gu, '').trim();
}

function riskText(value) {
  return stripEmoji(value);
}

function statusTone(status) {
  return { CRITICAL: 'red', WATCH: 'orange', NORMAL: 'green', NO_DEMAND: 'muted' }[status] || 'muted';
}

function statusText(status) {
  return { CRITICAL: '紧急', WATCH: '关注', NORMAL: '正常', NO_DEMAND: '无消耗' }[status] || status;
}

function stars(count) {
  const n = Math.max(1, Math.min(5, Number(count) || 1));
  return '●'.repeat(n) + '○'.repeat(5 - n);
}

function showToast(text) {
  const toast = $('#toast');
  toast.textContent = text;
  toast.classList.add('show');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove('show'), 2200);
}

function setModeChrome() {
  const d = state.data;
  const internal = d.meta.mode === 'internal';
  const badge = $('#modeBadge');
  badge.textContent = window.__SHARE_BUILD__ ? '分享讨论版 · 部分脱敏' : (internal ? '内部真实数据' : '比赛脱敏数据');
  badge.className = 'status-pill ' + (internal ? 'live' : 'demo');
  $('#asOf').textContent = '数据日期 ' + dateText(d.meta.as_of);
  $('#scopeText').textContent = internal ? '全部工厂' : '工厂 1501';
  $('#scopeText').title = d.meta.source_file || '';
  const workbuddyBadge = $('#workbuddyBadge');
  if (workbuddyBadge) {
    workbuddyBadge.querySelector('span').textContent = internal ? 'WorkBuddy 本地协同' : 'WorkBuddy 已协同';
    workbuddyBadge.title = '最近一次数据生成：' + (d.meta.generated_at || d.meta.as_of || '—');
    workbuddyBadge.classList.toggle('internal', internal);
  }
}

function hydrateDashboard(data) {
  state.data = data;
  state.mode = data.meta.mode || 'competition';
  $('#loadingPanel')?.remove();
  setModeChrome();
  renderAll();
  setRoute(routeFromHash(), false);
}

function loadScriptOnce(src) {
  const existing = document.querySelector(`script[data-dashboard-source="${src}"]`);
  if (existing) return existing.dataset.loaded === 'true'
    ? Promise.resolve()
    : new Promise((resolve, reject) => {
        existing.addEventListener('load', resolve, { once: true });
        existing.addEventListener('error', reject, { once: true });
      });
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.dataset.dashboardSource = src;
    script.addEventListener('load', () => {
      script.dataset.loaded = 'true';
      resolve();
    }, { once: true });
    script.addEventListener('error', () => reject(new Error('无法加载 ' + src)), { once: true });
    document.head.appendChild(script);
  });
}

function showDataLoadError(error, fileMode) {
  const panel = $('#loadingPanel');
  if (!panel) return;
  panel.innerHTML = fileMode ? `
    <div class="empty-state" style="max-width:620px;margin:8vh auto">
      <strong>无法读取本地数据</strong>
      当前是在浏览器中直接打开 HTML，浏览器会拦截本地 JSON 读取。<br>
      请先运行 <code>python scripts/generate_data.py</code> 生成
      <code>data/dashboard_data.js</code>，然后刷新页面。<br>
      也可以直接打开：
      <a href="./dist/供应雷达-分享讨论版.html">单文件分享版</a>。
    </div>
  ` : `
    <div class="empty-state" style="max-width:560px;margin:8vh auto">
      <strong>无法读取数据文件</strong>
      请确认已启动本地 HTTP 服务，并生成 <code>data/dashboard_data.json</code>。<br>
      在项目目录执行：<code>python -m http.server 8765</code><br>
      然后打开 <code>http://localhost:8765/</code>。
    </div>
  `;
  console.error(error);
}

async function loadData() {
  if (window.__DASHBOARD_DATA__) {
    hydrateDashboard(window.__DASHBOARD_DATA__);
    return;
  }
  const params = new URLSearchParams(location.search);
  state.mode = params.get('mode') === 'internal' ? 'internal' : 'competition';
  const forceScriptData = params.get('data') === 'script';
  if (location.protocol === 'file:' || forceScriptData) {
    const fallbackSource = state.mode === 'internal'
      ? './data/internal/dashboard_data.js'
      : './data/dashboard_data.js';
    try {
      await loadScriptOnce(fallbackSource);
      if (!window.__DASHBOARD_DATA__) throw new Error('本地数据桥接文件未提供 __DASHBOARD_DATA__');
      hydrateDashboard(window.__DASHBOARD_DATA__);
    } catch (error) {
      showDataLoadError(error, true);
    }
    return;
  }
  const source = state.mode === 'internal' ? './data/internal/dashboard_data.json' : './data/dashboard_data.json';
  try {
    const response = await fetch(source, { cache: 'no-store' });
    if (!response.ok) throw new Error('HTTP ' + response.status);
    hydrateDashboard(await response.json());
  } catch (error) {
    showDataLoadError(error, false);
  }
}

function renderAll() {
  renderOverview();
  renderTodayFocus();
  renderTodayAlerts();
  renderTodayTasks();
  renderProcurement();
  renderSupplyModules();
  renderSupply();
  renderProduction();
  renderIntelligence();
  renderIntelExtras();
  renderAICenter();
  renderMethod();
  initRobot();
  initSidebarNavigation();
  initGlobalUI();
  setViewCounts();
}

function setViewCounts() {
  const d = state.data;
  $('#navOverviewCount').textContent = tierCounts(d.supply.materials).t1;
  $('#navProcurementCount').textContent = d.supply.purchase_orders.items.length;
  $('#navSupplyCount').textContent = d.supply.suppliers.total;
  $('#navIntelCount').textContent = d.supply.external_market.available ? d.supply.external_market.items.length : '待接入';
  $('#navProductionCount').textContent = '4';
  $('#navAiCount').textContent = loadAgentTasks().filter(t => t.status !== 'done').length || 'Agent';
}

function routeFromHash() {
  const queryRoute = new URLSearchParams(location.search).get('route');
  const raw = queryRoute || decodeURIComponent((location.hash || '').replace(/^#/, ''));
  if (ROUTE_CONFIG[raw]) return raw;
  if (VIEW_DEFAULT_ROUTE[raw]) return VIEW_DEFAULT_ROUTE[raw];
  return 'today/home';
}

function showView(view, updateHash = false) {
  if (!NAV_VIEWS.includes(view)) view = 'overview';
  state.activeView = view;
  $$('.view').forEach(panel => panel.classList.toggle('active', panel.dataset.view === view));
  setTimeout(() => ensureViewCharts(view), 30);
}

function setRoute(route, updateHash = true) {
  const key = ROUTE_CONFIG[route] ? route : 'today/home';
  const config = ROUTE_CONFIG[key];
  if (config.mode) state.procurementMode = config.mode;
  showView(config.view, false);
  activateSidebarRoute(key, config.group);
  const groupEl = $('#breadcrumbGroup');
  const currentEl = $('#breadcrumbCurrent');
  if (groupEl) groupEl.textContent = config.groupLabel;
  if (currentEl) currentEl.textContent = config.label;
  if (config.view === 'procurement' && config.mode && state.data) renderProcurementMode();
  if (updateHash) history.replaceState(null, '', '#' + key);
  closeSidebar();
  if (config.section && new URLSearchParams(location.search).get('noscroll') !== '1') {
    setTimeout(() => {
      const target = document.getElementById(config.section);
      if (target) {
        const top = window.scrollY + target.getBoundingClientRect().top - 80;
        window.scrollTo({ top: Math.max(0, top), behavior: 'auto' });
      }
    }, 90);
  } else {
    window.scrollTo({ top: 0, behavior: 'auto' });
  }
}

function setView(view, updateHash = true) {
  setRoute(VIEW_DEFAULT_ROUTE[view] || view, updateHash);
}

function activateSidebarRoute(route, group) {
  $$('.nav-group').forEach(item => item.classList.toggle('active', item.dataset.navGroup === group));
  $$('.nav-child').forEach(item => {
    const active = item.dataset.route === route;
    item.classList.toggle('active', active);
    if (active) item.setAttribute('aria-current', 'page'); else item.removeAttribute('aria-current');
  });
  openSidebarGroup(group);
}

function openSidebarGroup(group) {
  $$('.nav-group').forEach(item => {
    const open = item.dataset.navGroup === group;
    item.classList.toggle('open', open);
    const button = $('.nav-group-toggle', item);
    if (button) button.setAttribute('aria-expanded', String(open));
  });
}

function closeSidebarGroup(groupEl) {
  groupEl.classList.remove('open');
  $('.nav-group-toggle', groupEl)?.setAttribute('aria-expanded', 'false');
}

function initSidebarNavigation() {
  $$('.nav-group-toggle').forEach(button => {
    button.addEventListener('click', () => {
      const groupEl = button.closest('.nav-group');
      if (!groupEl) return;
      const isOpen = groupEl.classList.contains('open');
      $$('.nav-group').forEach(item => {
        if (item !== groupEl) closeSidebarGroup(item);
      });
      if (isOpen) closeSidebarGroup(groupEl); else openSidebarGroup(groupEl.dataset.navGroup);
    });
  });
  $$('.nav-child').forEach(button => {
    button.addEventListener('click', () => setRoute(button.dataset.route));
  });
  $$('[data-route-nav]').forEach(button => {
    button.addEventListener('click', () => setRoute(button.dataset.routeNav));
  });
  $$('[data-go-view]').forEach(button => {
    button.addEventListener('click', () => setView(button.dataset.goView));
  });
  $("#workbuddyBadge")?.addEventListener('click', () => setRoute('ai/workbuddy'));
  $('#sidebarToggle')?.addEventListener('click', () => document.body.classList.add('sidebar-open'));
  $('#sidebarClose')?.addEventListener('click', closeSidebar);
  $('#sidebarOverlay')?.addEventListener('click', closeSidebar);
  window.addEventListener('hashchange', () => setRoute(routeFromHash(), false));
  if (new URLSearchParams(location.search).get('sidebar') === '1') setTimeout(() => document.body.classList.add('sidebar-open'), 300);
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      closeSidebar();
      closeDrawer();
      closeRobot();
      closeMethod();
    }
  });
}

function closeSidebar() {
  document.body.classList.remove('sidebar-open');
}

function scheduleMega(view) {
  clearTimeout(state.megaTimer);
  clearTimeout(state.closeTimer);
  state.megaTimer = setTimeout(() => showMega(view), 120);
}

function scheduleCloseMega() {
  clearTimeout(state.megaTimer);
  clearTimeout(state.closeTimer);
  state.closeTimer = setTimeout(closeMega, 200);
}

function showMega(view) {
  if (!state.data || window.innerWidth < 900) return;
  state.megaView = view;
  const menu = $('#megaMenu');
  menu.innerHTML = renderMega(view);
  menu.setAttribute('aria-hidden', 'false');
  $('#topShell').classList.add('mega-open');
  $$('.mega-link', menu).forEach(button => button.addEventListener('click', () => setView(button.dataset.view || view)));
  $$('[data-mega-action]', menu).forEach(button => button.addEventListener('click', () => {
    const action = state.data.supply.actions.find(x => x.key === button.dataset.megaAction);
    if (action) openAction(action);
  }));
  $$('[data-mega-material]', menu).forEach(button => button.addEventListener('click', () => {
    const material = state.data.supply.materials.find(x => x.material === button.dataset.megaMaterial);
    if (material) openMaterial(material);
  }));
  $$('[data-mega-supplier]', menu).forEach(button => button.addEventListener('click', () => {
    const supplier = state.data.supply.suppliers.items.find(x => x.name === button.dataset.megaSupplier);
    if (supplier) openSupplier(supplier);
  }));
}

function closeMega() {
  clearTimeout(state.megaTimer);
  clearTimeout(state.closeTimer);
  state.megaView = null;
  $('#topShell')?.classList.remove('mega-open');
  $('#megaMenu')?.setAttribute('aria-hidden', 'true');
}

function renderMega(view) {
  const d = state.data;
  if (view === 'overview') {
    const counts = tierCounts(d.supply.materials);
    const total = d.supply.materials.length || 1;
    const top = d.supply.materials.filter(m => tierOf(m) === 't1').slice(0, 5);
    return `
      <div class="mega-inner">
        <div class="mega-block"><h4>风险分档</h4>
          <div class="mega-tier">${TIER_DEFS.map(t => `<span style="background:${t.color}1a;color:${t.key === 't5' ? '#64748b' : t.color}">${t.name} ${counts[t.key]}</span>`).join('')}</div>
          <div class="tier-bar" style="height:6px">${TIER_DEFS.filter(t => counts[t.key] > 0).map(t => `<span class="tier-seg" style="width:${(counts[t.key] / total * 100).toFixed(2)}%;background:${t.color}"></span>`).join('')}</div>
          <p class="mega-note" style="margin-top:10px;margin-bottom:0">${total} 项物料，严重档 ${counts.t1} 项需今日处理。</p>
        </div>
        <div class="mega-block"><h4>严重档 TOP5</h4><div class="mega-list">
          ${top.map(m => `<button class="mega-row" data-mega-material="${esc(m.material)}"><span>${esc(m.material)} · ${esc(m.plant)}</span><span>${m.dynamic_inventory_days == null ? '无消耗' : m.dynamic_inventory_days.toFixed(1) + '天'}</span></button>`).join('') || '<div class="empty-state">暂无严重档物料</div>'}
        </div></div>
        <div class="mega-block"><h4>今日判断</h4><p class="mega-note">${esc(d.overview.summary_text)}</p><button class="mega-link" data-view="overview">查看完整总览 →</button></div>
      </div>
    `;
  }
  if (view === 'procurement') {
    const po = d.supply.purchase_orders.summary;
    const poItems = d.supply.purchase_orders.items || [];
    const poCounts = { t1: 0, t2: 0, t3: 0, t4: 0, t5: 0 };
    poItems.forEach(x => { poCounts[poTier(x)]++; });
    const poTotal = poItems.length || 1;
    return `
      <div class="mega-inner">
        <div class="mega-block"><h4>在途 PO 分档</h4>
          <div class="mega-tier">${TIER_DEFS.map(t => `<span style="background:${t.color}1a;color:${t.color}">${t.name} ${poCounts[t.key]}</span>`).join('')}</div>
          <div class="tier-bar" style="height:6px">${TIER_DEFS.filter(t => poCounts[t.key] > 0).map(t => `<span class="tier-seg" style="width:${(poCounts[t.key] / poTotal * 100).toFixed(2)}%;background:${t.color}"></span>`).join('')}</div>
          <p class="mega-note" style="margin-top:10px;margin-bottom:0">${poTotal} 张在途 · 未交量 ${compact(po.open_qty, 0)} kg · 未匹配风险表 ${po.unmatched_risk} 张</p>
        </div>
        <div class="mega-block"><h4>今日建议 TOP5</h4><div class="mega-list">
          ${d.supply.actions.slice(0, 5).map(a => `<button class="mega-row" data-mega-action="${esc(a.key)}"><span>${esc(a.material)} · ${esc(a.plant)}</span><span>${compact(a.suggested_replenishment, 0)} kg</span></button>`).join('')}
        </div></div>
        <div class="mega-block"><h4>采购判断</h4><p class="mega-note">严重 ${poCounts.t1} 张需今日催办，未跟踪 ${poCounts.t5} 张疑似未清账需先核对台账。</p><button class="mega-link" data-view="procurement">查看完整采购执行 →</button></div>
      </div>
    `;
  }
  if (view === 'supply') {
    const top = [...d.supply.suppliers.items].sort((a, b) => b.delivery_health_score - a.delivery_health_score).slice(0, 5);
    return `
      <div class="mega-inner">
        <div class="mega-block"><h4>供应网络</h4><div class="mega-kpis">
          <div class="mega-kpi"><strong>${d.supply.suppliers.total}</strong><span>供应商</span></div>
          <div class="mega-kpi"><strong>${d.supply.geo.located}</strong><span>已定位</span></div>
          <div class="mega-kpi"><strong>${money(d.warehouse.summary.inventory_amount)}</strong><span>库存金额</span></div>
          <div class="mega-kpi"><strong>${d.warehouse.summary.batch_rows}</strong><span>仓储批次</span></div>
        </div></div>
        <div class="mega-block"><h4>画像 TOP5</h4><div class="mega-list">
          ${top.map(s => `<button class="mega-row" data-mega-supplier="${esc(s.name)}"><span>${esc(s.name)}</span><span>${s.delivery_health_score.toFixed(1)}</span></button>`).join('')}
        </div></div>
        <div class="mega-block"><h4>供应侧提示</h4><p class="mega-note">${d.data_quality.derived.missing_mb51_receipts ?? 0} 条缺 MB51 收货记录需要优先核查。</p><button class="mega-link" data-view="supply">查看供应商与仓储 →</button></div>
      </div>
    `;
  }
  const market = d.supply.external_market;
  return `
    <div class="mega-inner">
      <div class="mega-block"><h4>行情状态</h4><div class="mega-kpis">
        <div class="mega-kpi"><strong>${market.available ? market.items.length : '—'}</strong><span>行情条目</span></div>
        <div class="mega-kpi"><strong>${market.available ? market.summary.strong_rising_count : '—'}</strong><span>强上涨</span></div>
        <div class="mega-kpi"><strong>${market.available ? market.summary.rising_count : '—'}</strong><span>上涨</span></div>
        <div class="mega-kpi"><strong>${(d.data_quality.derived.unmatched_overdue_po ?? 0)}</strong><span>未匹配逾期PO</span></div>
      </div></div>
      <div class="mega-block"><h4>外部信号</h4><p class="mega-note">${market.available ? '已接入 WorkBuddy 行情数据。' : '尚未收到 external_market.json，当前只展示内部供应信号。'}</p><p class="mega-note">${esc(d.overview.summary_text)}</p></div>
      <div class="mega-block"><h4>内部信号</h4>
        <div class="mega-tier">${TIER_DEFS.slice(0, 3).map(t => `<span style="background:${t.color}1a;color:${t.color}">${t.name} ${tierCounts(d.supply.materials)[t.key]}</span>`).join('')}</div>
        <p class="mega-note" style="margin-bottom:0">${tierCounts(d.supply.materials).t1} 项严重档需今日处理，${d.supply.purchase_orders.summary.overdue} 张 PO 逾期。</p>
        <button class="mega-link" data-view="intelligence">查看行情情报 →</button></div>
    </div>
  `;
}

function formatKpiValue(kpi) {
  if (kpi.unit === 'kg') return compact(kpi.value, 2);
  return num(kpi.value, 0);
}

/* 五档分档定义 —— 纪律① 分档不合并 */
const TIER_DEFS = [
  { key: 't1', name: '严重', color: 'var(--t1)', hint: '紧急且可用≤3天' },
  { key: 't2', name: '预警', color: 'var(--t2)', hint: '紧急但可用>3天' },
  { key: 't3', name: '临期', color: 'var(--t3)', hint: '关注档' },
  { key: 't4', name: '正常', color: 'var(--t4)', hint: '覆盖充足' },
  { key: 't5', name: '未跟踪', color: 'var(--t5)', hint: '无消耗或覆盖天数缺失' },
];

function tierOf(m) {
  const rl = m.risk_level || '';
  const cd = m.coverage_days;
  if (!m.avg_daily || cd == null) return 't5';
  if (rl.indexOf('紧急') >= 0) return cd <= 3 ? 't1' : 't2';
  if (rl.indexOf('关注') >= 0) return 't3';
  return 't4';
}

function tierCounts(materials) {
  const counts = { t1: 0, t2: 0, t3: 0, t4: 0, t5: 0 };
  materials.forEach(m => { counts[tierOf(m)]++; });
  return counts;
}

function renderTierBar(counts, total) {
  const segs = TIER_DEFS.filter(t => counts[t.key] > 0).map(t =>
    `<span class="tier-seg" style="width:${(counts[t.key] / total * 100).toFixed(2)}%;background:${t.color}" title="${t.name} ${counts[t.key]} 项"></span>`
  ).join('');
  const legend = TIER_DEFS.map(t =>
    `<span class="tier-item"><i style="background:${t.color}"></i><span>${t.name}</span><strong style="color:${t.key === 't5' ? '#94a3b8' : t.color}">${counts[t.key]}</strong></span>`
  ).join('');
  return `<div class="tier-bar">${segs}</div><div class="tier-legend">${legend}</div>`;
}

function renderOverview() {
  const d = state.data;
  const materials = d.supply.materials;
  const actions = d.supply.actions;
  const counts = tierCounts(materials);
  const total = materials.length || 1;
  const qtyUnit = d.meta.quantity_unit || 'kg';
  const safetyKpi = d.overview.kpis.find(k => k.id === 'safety_stock');
  const replenishmentKpi = d.overview.kpis.find(k => k.id === 'replenishment_new');
  const overdue = d.overview.decision_cards.overdue;
  const review = d.overview.decision_cards.review;
  const pendingTotal = actions.length + overdue.count + review.count;

  $('#overviewSummary').textContent = d.overview.summary_text || '先看分档分布，再看今日决策，最后回到物料明细。';

  const kpis = [
    {
      id: 'severe',
      label: '风险物料 · 严重档',
      value: counts.t1,
      unit: '项',
      tone: 'red',
      foot: '当前最高优先级',
    },
    {
      id: 'shortage',
      label: '预计缺料 · 未来 7 天',
      value: actions.length,
      unit: '项',
      tone: 'orange',
      foot: '按当前补货建议口径',
    },
    {
      id: 'arrival',
      label: '异常到货 · 已过承诺日',
      value: overdue.count,
      unit: '项',
      tone: 'amber',
      foot: '已过建议下单日',
    },
    {
      id: 'pending',
      label: '待完成任务',
      value: pendingTotal,
      unit: '项',
      tone: 'neutral',
      foot: '含 ' + review.count + ' 项待复核',
    },
  ];
  $('#overviewKpis').innerHTML = kpis.map(item => `
    <button class="home-kpi" type="button" data-kpi-detail="${item.id}" aria-label="查看${esc(item.label)}明细">
      <div class="home-kpi-label">${esc(item.label)}</div>
      <div class="home-kpi-value ${item.tone}">${num(item.value)}<small>${esc(item.unit)}</small></div>
      <div class="home-kpi-bottom"><div class="home-kpi-foot">${esc(item.foot)}</div><span class="home-kpi-link">查看明细 <i>→</i></span></div>
    </button>
  `).join('');

  $$('#overviewKpis [data-kpi-detail]').forEach(card => {
    card.addEventListener('click', () => openKpiDetail(card.dataset.kpiDetail));
  });
  const kpiPreview = new URLSearchParams(location.search).get('kpi');
  if (kpiPreview) setTimeout(() => openKpiDetail(kpiPreview), 350);

  const priorityCount = counts.t2 + counts.t3;
  const normalCount = counts.t4 + counts.t5;
  const severePct = counts.t1 / total * 100;
  const priorityPct = priorityCount / total * 100;
  const normalPct = normalCount / total * 100;
  const riskVerdict = counts.t1
    ? `今日先处理 ${counts.t1} 项严重物料${priorityCount ? `，再核查 ${priorityCount} 项优先物料` : ''}。`
    : priorityCount
      ? `今日有 ${priorityCount} 项优先物料需跟进。`
      : '当前没有需要升级处置的供应风险。';  $('#riskBandNote').textContent = total + ' 个物料页 · ' + actions.length + ' 项补单建议';
  $('#riskDistributionBand').innerHTML = `
    <div class="home-risk-conclusion"><strong>${esc(riskVerdict)}</strong><span>正常 ${normalCount} 项保持中性显示，不进入今日关注队列</span></div>
    <div class="home-risk-stack" role="img" aria-label="${esc(riskVerdict)}">
      <i class="red" style="width:${severePct.toFixed(3)}%"></i>
      <i class="orange" style="width:${priorityPct.toFixed(3)}%"></i>
      <i class="green" style="width:${normalPct.toFixed(3)}%"></i>
    </div>
    <div class="home-risk-legend">
      <span><i class="red"></i>严重 <b>${counts.t1}</b></span>
      <span><i class="orange"></i>优先 <b>${priorityCount}</b></span>
      <span><i class="green"></i>正常 <b>${normalCount}</b></span>
      <em>合计 ${total} 个物料页 · ${d.supply.suppliers.total} 家供应商 · 安全库存 ${compact(safetyKpi?.value, 2)} ${qtyUnit} · 新建议补货 ${compact(replenishmentKpi?.value, 2)} ${qtyUnit}</em>
    </div>
  `;

  const taskMap = new Map();
  [...(overdue.items || []), ...(review.items || [])].forEach(item => {
    if (item && item.key && !taskMap.has(item.key)) taskMap.set(item.key, item);
  });
  const bucketOrder = { overdue: 0, due_today: 1, due_7d: 2, review: 3, unscheduled: 4 };
  const taskItems = [...taskMap.values()].sort((a, b) => {
    const bucketDiff = (bucketOrder[a.decision_bucket] ?? 9) - (bucketOrder[b.decision_bucket] ?? 9);
    if (bucketDiff) return bucketDiff;
    return String(a.must_order_by || '9999-12-31').localeCompare(String(b.must_order_by || '9999-12-31'));
  }).slice(0, 5);

  $('#focusTaskTable').innerHTML = taskItems.length ? `
    <table class="home-table">
      <thead><tr><th>优先级</th><th>物料</th><th>预警原因</th><th>预计缺料</th><th>建议动作</th><th>状态</th></tr></thead>
      <tbody>${taskItems.map(item => {
        const level = stripEmoji(item.risk_level);
        const tone = level.includes('紧急') ? 'red' : level.includes('关注') ? 'orange' : 'green';
        const coverage = item.coverage_days == null ? null : Number(item.coverage_days);
        const status = item.decision_bucket === 'overdue' ? '待处理' : item.needs_review ? '待复核' : '待排期';
        return `<tr data-home-action="${esc(item.key)}"><td><span class="home-badge ${tone}">${esc(level || '未定级')}</span></td><td><div class="home-material"><b>${esc(item.material)}</b><span>${esc(item.description || item.plant)}</span></div></td><td class="home-reason">${esc(item.risk_reason || '—')}</td><td class="home-num ${coverage !== null && coverage <= 3 ? 'red' : coverage !== null && coverage <= 7 ? 'orange' : ''}">${coverage == null ? '—' : coverage.toFixed(1) + ' 天'}</td><td class="home-action-cell"><button type="button" class="row-action-trigger" title="${esc(item.action_text || '待确认动作')}">查看处置 <i>→</i></button></td><td class="home-status">${esc(status)}</td></tr>`;
      }).join('')}</tbody>
    </table>
  ` : '<div class="home-empty">今日暂无需要立即动作的任务</div>';

  $$('#focusTaskTable [data-home-action]').forEach(row => {
    row.addEventListener('click', () => {
      const action = state.data.supply.actions.find(a => a.key === row.dataset.homeAction);
      if (action) openAction(action);
    });
  });

  const lowConfidence = actions.filter(a => a.confidence === '低').length;
  const highRiskSupplier = [...d.supply.suppliers.items]
    .sort((a, b) => (a.delivery_health_score ?? 0) - (b.delivery_health_score ?? 0))[0];
  const adviceItems = [
    '优先处理严重档 ' + counts.t1 + ' 项，其中 ' + overdue.count + ' 项已过建议下单日，需先确认交付承诺。',
    '复核 ' + review.count + ' 项待复核行动，其中低置信度 ' + lowConfidence + ' 项，建议人工确认样本与差异原因。',
    highRiskSupplier
      ? '关注 ' + highRiskSupplier.name + ' 的交付表现，准时率 ' + pct(highRiskSupplier.on_time_rate) + '，缺收货 ' + highRiskSupplier.missing_receipts + ' 单。'
      : '当前暂无供应商交付数据，建议先完成 MB51 收货匹配。',
  ];
  $('#aiAdvicePanel').innerHTML = `
    <div class="home-card-head">
      <div><h3>AI 今日行动建议</h3><p>基于当前库存、到货与供应商交付数据，不含主观判断。</p></div>
      <span class="home-local-tag">本地规则</span>
    </div>
    <div class="home-advice-list">
      ${adviceItems.map((text, index) => `<div class="home-advice-item"><span>0${index + 1}</span><p>${esc(text)}</p></div>`).join('')}
    </div>
    <div class="home-divider"></div>
    <div class="home-change-title">风险变化 · 较上次计算</div>
    <div class="home-change-row"><span class="home-chip">新增 —</span><span class="home-chip">升级 —</span><span class="home-chip">缓解 —</span><em>历史快照未接入</em></div>
  `;

  const timelineMaterials = materials
    .filter(m => m.coverage_days != null && (m.avg_daily || 0) > 0)
    .sort((a, b) => Number(a.coverage_days) - Number(b.coverage_days))
    .slice(0, 6);
  const axisStart = new Date(String(d.meta.as_of || '').slice(0, 10) + 'T00:00:00');
  const axisDays = Number.isNaN(axisStart.getTime()) ? [] : [0, 3, 6, 9, 12, 14].map(days => {
    const date = new Date(axisStart);
    date.setDate(date.getDate() + days);
    return (date.getMonth() + 1) + '/' + date.getDate();
  });
  $('#coverageTimeline').innerHTML = `
    <div class="home-card-head tight"><div><h3>未来 14 天缺料时间轴</h3><p>按当前覆盖天数排序，提前识别触及安全线的物料。</p></div></div>
    <div class="home-timeline">${timelineMaterials.map(m => {
      const days = Number(m.coverage_days);
      const width = Math.min(100, Math.max(4, days / 14 * 100));
      const tone = tierOf(m) === 't1' ? 'red' : tierOf(m) === 't2' || tierOf(m) === 't3' ? 'orange' : 'green';
      return `<div class="home-timeline-row"><div class="home-timeline-name">${esc(m.material)}<span>${esc(m.plant)} · ${days.toFixed(1)} 天</span></div><div class="home-timeline-track"><i class="${tone}" style="width:${width.toFixed(1)}%"></i></div></div>`;
    }).join('') || '<div class="home-empty">暂无覆盖天数数据</div>'}</div>
    <div class="home-timeline-axis">${axisDays.map(day => `<span>${day}</span>`).join('')}</div>
  `;

  const sourceMap = {
    '无未来计划到货': materials.filter(m => String(m.risk_reason || '').includes('无未来计划到货')).length,
    '理论覆盖不足': materials.filter(m => String(m.risk_reason || '').includes('理论覆盖不足')).length,
    '已过建议下单日': overdue.count,
    '待复核行动': review.count,
  };
  const sourceRows = Object.entries(sourceMap).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const sourceMax = Math.max(...sourceRows.map(x => x[1]), 1);
  $('#riskSourcePanel').innerHTML = `
    <div class="home-card-head tight"><div><h3>供应风险来源分布</h3><p>按风险成因归因，同一物料可命中多类。</p></div></div>
    <div class="home-source-list">${sourceRows.map(([name, value]) => `<div class="home-source-row"><span>${esc(name)}</span><div><i style="width:${(value / sourceMax * 100).toFixed(1)}%"></i></div><b>${value}</b></div>`).join('')}</div>
  `;

  const warnings = d.meta.warnings || [];
  $('#overviewNotices').innerHTML = `
    <div><strong>数据口径</strong><span>${esc(warnings[0] || d.provenance.visibility?.competition || '以 dashboard_data.json 为准')}</span></div>
    <div><strong>数据质量</strong><span>缺 MB51 收货 ${d.data_quality.derived.missing_mb51_receipts ?? 0} 行 · 待复核行动 ${review.count} 项</span></div>
    <div><strong>计算方式</strong><span>补货量与安全库存由 Python 生成器计算，前端仅展示。</span></div>
  `;
}

function kpiDetailActionRow(item) {
  const coverage = item.coverage_days == null ? null : Number(item.coverage_days);
  const level = stripEmoji(item.risk_level);
  const tone = level.includes('紧急') ? 'red' : level.includes('关注') ? 'orange' : 'green';
  return `
    <button class="kpi-detail-row" type="button" data-kpi-action="${esc(item.key)}">
      <span class="home-badge ${tone}">${esc(level || '未定级')}</span>
      <span class="kpi-detail-main"><strong>${esc(item.material)} · ${esc(item.plant)}</strong><small>${esc(item.risk_reason || '—')}</small></span>
      <span class="kpi-detail-value"><b>${coverage == null ? '—' : coverage.toFixed(1) + ' 天'}</b><small>${esc(item.confidence || '')} · ${compact(item.suggested_replenishment, 0)} kg</small></span>
    </button>
  `;
}

function kpiDetailMaterialRow(item) {
  const coverage = item.coverage_days == null ? null : Number(item.coverage_days);
  return `
    <button class="kpi-detail-row" type="button" data-kpi-material="${esc(item.key)}">
      <span class="home-badge red">严重</span>
      <span class="kpi-detail-main"><strong>${esc(item.material)} · ${esc(item.plant)}</strong><small>${esc(item.risk_reason || '—')}</small></span>
      <span class="kpi-detail-value"><b>${coverage == null ? '—' : coverage.toFixed(1) + ' 天'}</b><small>可用 ${compact(item.available, 0)} kg</small></span>
    </button>
  `;
}

function kpiDetailSection(title, subtitle, rows) {
  return `
    <section class="kpi-detail-section">
      <div class="kpi-detail-heading"><div><h4>${esc(title)}</h4><p>${esc(subtitle)}</p></div><span>${rows.length} 项</span></div>
      <div class="kpi-detail-list">${rows.join('') || '<div class="empty-state">暂无数据</div>'}</div>
    </section>
  `;
}

function openKpiDetail(kind) {
  const d = state.data;
  const actions = d.supply.actions;
  const overdue = d.overview.decision_cards.overdue;
  const review = d.overview.decision_cards.review;
  const severe = d.supply.materials.filter(m => tierOf(m) === 't1').sort((a, b) => (a.coverage_days ?? 99999) - (b.coverage_days ?? 99999));
  let title = '';
  let eyebrow = '';
  let body = '';

  if (kind === 'severe') {
    title = '严重档物料明细';
    eyebrow = 'KPI · 风险物料';
    body = kpiDetailSection('严重档物料', '对应首页 KPI：风险物料 · 严重档', severe.map(kpiDetailMaterialRow));
  } else if (kind === 'shortage') {
    title = '预计缺料 · 未来 7 天';
    eyebrow = 'KPI · 补货建议';
    body = kpiDetailSection('补货行动清单', '按当前补货建议口径，共 ' + actions.length + ' 项', actions.map(kpiDetailActionRow));
  } else if (kind === 'arrival') {
    title = '异常到货 · 已过承诺日';
    eyebrow = 'KPI · 到货异常';
    body = kpiDetailSection('已过建议下单日', '来自决策卡 overdue.items', (overdue.items || []).map(kpiDetailActionRow));
  } else {
    title = '待完成任务明细';
    eyebrow = 'KPI · 任务来源';
    body = `
      <div class="kpi-detail-summary"><strong>${actions.length + overdue.count + review.count}</strong><span>任务信号合计</span><em>补货建议 ${actions.length} + 已过下单日 ${overdue.count} + 待复核 ${review.count}</em></div>
      ${kpiDetailSection('补货建议', '补货行动清单', actions.map(kpiDetailActionRow))}
      ${kpiDetailSection('已过建议下单日', '决策卡 overdue.items', (overdue.items || []).map(kpiDetailActionRow))}
      ${kpiDetailSection('待复核行动', '决策卡 review.items', (review.items || []).map(kpiDetailActionRow))}
    `;
  }

  openDrawer(title, eyebrow, body);
  $$('#drawerBody [data-kpi-action]').forEach(row => {
    row.addEventListener('click', () => {
      const action = state.data.supply.actions.find(a => a.key === row.dataset.kpiAction);
      if (action) openAction(action);
    });
  });
  $$('#drawerBody [data-kpi-material]').forEach(row => {
    row.addEventListener('click', () => {
      const material = state.data.supply.materials.find(m => m.key === row.dataset.kpiMaterial);
      if (material) openMaterial(material);
    });
  });
}

function decisionMiniItems(key) {
  const d = state.data;
  let items = [];
  if (key === 'overdue') items = d.overview.decision_cards.overdue.items;
  if (key === 'due_7d') items = d.overview.decision_cards.due_7d.items;
  if (key === 'review') items = d.overview.decision_cards.review.items;
  if (key === 'unscheduled') items = d.overview.decision_cards.unscheduled.items;
  return (items || []).slice(0, 2).map(a => `<span>${esc(a.material)} · ${esc(a.plant)} · ${compact(a.suggested_replenishment, 0)} kg</span>`).join('') || '<span>暂无明细</span>';
}

const CHART_COLORS = ['#1B5378', '#4A8A9E', '#8CA6AE', '#B98A4E', '#A33A2A', '#7B8880'];
const CHART_AXIS = '#E6E3DD';
const CHART_GRID = '#EDEAE4';
const CHART_LABEL = '#7E8388';

function chartTheme() {
  return {
    color: CHART_COLORS,
    textStyle: { fontFamily: 'Inter, PingFang SC, Microsoft YaHei, sans-serif', color: CHART_LABEL },
    tooltip: {
      backgroundColor: '#FFFFFF',
      borderColor: CHART_AXIS,
      borderWidth: 1,
      textStyle: { color: '#1B1D1F', fontSize: 12 },
      extraCssText: 'box-shadow:none;border-radius:5px;',
    },
  };
}

function ensureChart(id, option) {
  const el = document.getElementById(id);
  if (!el || !window.echarts) return;
  let instance = state.charts[id];
  if (instance && instance.getDom() !== el) {
    instance.dispose();
    instance = null;
    delete state.charts[id];
  }
  if (!instance) {
    instance = echarts.init(el);
    state.charts[id] = instance;
  }
  instance.setOption(option, true);
}

function ensureViewCharts(view) {
  if (!state.data) return;
  if (view === 'overview') {
    renderRiskChart();
    renderConfidenceChart();
  }
  if (view === 'procurement') {
    renderGapTrendChart();
  }
  if (view === 'supply') {
    renderChinaMap();
    renderAgingChart();
  }
}

function renderRiskChart() {
  const data = state.data.overview.distributions.risk.map(item => ({ name: riskText(item.name), value: item.value }));
  ensureChart('riskChart', {
    ...chartTheme(),
    tooltip: { trigger: 'item', ...chartTheme().tooltip },
    legend: { bottom: 0, icon: 'circle', itemWidth: 7, itemHeight: 7, textStyle: { fontSize: 11, color: CHART_LABEL } },
    series: [{
      type: 'pie', radius: ['48%', '70%'], center: ['50%', '43%'], avoidLabelOverlap: true,
      itemStyle: { borderColor: '#fff', borderWidth: 3 },
      label: { show: false }, emphasis: { label: { show: false } },
      data: data.map((item, index) => ({ ...item, itemStyle: { color: [CHART_COLORS[5], CHART_COLORS[3], CHART_COLORS[4], CHART_COLORS[2]][index] || CHART_COLORS[0] } })),
    }],
  });
}

function renderConfidenceChart() {
  const items = state.data.overview.distributions.confidence_active;
  const labels = ['高', '中', '低'];
  const color = { 高: CHART_COLORS[5], 中: CHART_COLORS[0], 低: CHART_COLORS[3] };
  ensureChart('confidenceChart', {
    ...chartTheme(),
    grid: { left: 22, right: 18, top: 16, bottom: 26 },
    xAxis: { type: 'value', splitLine: { lineStyle: { color: CHART_GRID, type: 'solid' } }, axisLine: { show: false }, axisTick: { show: false }, axisLabel: { fontSize: 11, color: CHART_LABEL } },
    yAxis: { type: 'category', data: labels, axisLine: { show: false }, axisTick: { show: false }, axisLabel: { fontSize: 11, color: CHART_LABEL } },
    series: [{
      type: 'bar', barWidth: 15, label: { show: true, position: 'right', fontSize: 11, color: CHART_LABEL },
      data: labels.map(name => {
        const value = items.find(x => x.name === name)?.value || 0;
        return { value, itemStyle: { color: color[name], borderRadius: 0 } };
      }),
    }],
  });
}

window.addEventListener('resize', () => {
  Object.values(state.charts).forEach(chart => chart.resize());
});


function renderProcurement() {
  const d = state.data;
  const po = d.supply.purchase_orders.summary;
  const poItems = d.supply.purchase_orders.items || [];
  const poCounts = { t1: 0, t2: 0, t3: 0, t4: 0, t5: 0 };
  poItems.forEach(x => { poCounts[poTier(x)]++; });
  const poTotal = poItems.length || 1;
  $('#poSummary').innerHTML = `
    <div class="po-stat t1"><span>严重</span><strong>${poCounts.t1}</strong><small>逾期 5 天以上</small></div>
    <div class="po-stat t2"><span>预警</span><strong>${poCounts.t2}</strong><small>逾期 3–5 天</small></div>
    <div class="po-stat t3"><span>临期</span><strong>${poCounts.t3}</strong><small>逾期 1–2 天 / 2 天内到货</small></div>
    <div class="po-stat t4"><span>正常</span><strong>${poCounts.t4}</strong><small>在途未到期</small></div>
    <div class="po-stat t5"><span>未跟踪</span><strong>${poCounts.t5}</strong><small>疑似未清账，非交期问题</small></div>
    <div class="po-band">
      ${renderTierBar(poCounts, poTotal)}
      <div class="prov-row"><b>${poTotal} 张在途 PO</b><span class="prov-sep"></span><span>未交量合计 ${compact(po.open_qty, 0)} kg</span><span class="prov-sep"></span><span class="prov-tag">未匹配风险表 ${po.unmatched_risk} 张</span><span class="prov-sep"></span><span>±Nd = 该供应商近 12 个月 P80 延误天数，非承诺交期保证</span></div>
    </div>
  `;

  $('#chaseCount').textContent = d.supply.purchase_orders.items.length;
  $('#replenishCount').textContent = d.supply.actions.length;
  $$('#procurementMode .seg').forEach(button => {
    button.classList.toggle('active', button.dataset.mode === state.procurementMode);
    button.setAttribute('aria-selected', String(button.dataset.mode === state.procurementMode));
    button.addEventListener('click', () => {
      state.procurementMode = button.dataset.mode;
      state.actionFilter = 'all';
      renderProcurementMode();
    });
  });
  $('#actionSearch').addEventListener('input', event => {
    state.actionSearch = event.target.value.trim().toLowerCase();
    renderActionTable();
  });
  $('#actionResetBtn').addEventListener('click', () => {
    state.actionFilter = 'all';
    state.actionSearch = '';
    $('#actionSearch').value = '';
    renderActionTable();
  });
  $('#actionMethodBtn').addEventListener('click', openMethod);
  renderProcurementMode();
  renderAtpPanel();
  renderSideActions();
  renderSideQuality();
}

function renderProcurementMode() {
  $$('#procurementMode .seg').forEach(button => {
    button.classList.toggle('active', button.dataset.mode === state.procurementMode);
    button.setAttribute('aria-selected', String(button.dataset.mode === state.procurementMode));
  });
  renderActionFilters();
  renderActionTable();
}

function renderActionFilters() {
  const d = state.data;
  let filters = [];
  if (state.procurementMode === 'chase') {
    const po = d.supply.purchase_orders.items;
    filters = [
      { key: 'all', label: '全部', count: po.length },
      { key: 'overdue', label: '逾期', count: po.filter(x => x.decision_bucket === 'overdue').length, tone: 'red' },
      { key: 'due2', label: '2天内', count: po.filter(x => x.decision_bucket === 'due_2d').length, tone: 'orange' },
      { key: 'future', label: '未来', count: po.filter(x => x.decision_bucket === 'future').length },
      { key: 'unmatched', label: '未匹配风险表', count: po.filter(x => !x.matched_risk).length },
    ];
  } else {
    const actions = d.supply.actions;
    filters = [
      { key: 'all', label: '全部', count: actions.length },
      { key: 'overdue', label: '已逾期', count: actions.filter(x => x.decision_bucket === 'overdue').length, tone: 'red' },
      { key: 'due7', label: '今天/7天', count: actions.filter(x => ['due_today','due_7d'].includes(x.decision_bucket)).length, tone: 'orange' },
      { key: 'review', label: '待复核', count: actions.filter(x => x.needs_review).length, tone: 'amber' },
      { key: 'unscheduled', label: '无下单日', count: actions.filter(x => x.decision_bucket === 'unscheduled').length },
      { key: 'high_conf', label: '高置信', count: actions.filter(x => x.confidence === '高').length },
    ];
  }
  $('#actionFilters').innerHTML = filters.map(item => `
    <button class="filter-chip ${item.tone || ''} ${state.actionFilter === item.key ? 'active' : ''}" data-filter="${item.key}">
      <i></i>${item.label}<span>${item.count}</span>
    </button>
  `).join('');
  $$('#actionFilters .filter-chip').forEach(button => {
    button.addEventListener('click', () => {
      state.actionFilter = button.dataset.filter;
      renderActionFilters();
      renderActionTable();
    });
  });
}

function filteredPOs() {
  let rows = state.data.supply.purchase_orders.items.slice();
  if (state.actionFilter === 'overdue') rows = rows.filter(x => x.decision_bucket === 'overdue');
  if (state.actionFilter === 'due2') rows = rows.filter(x => x.decision_bucket === 'due_2d');
  if (state.actionFilter === 'future') rows = rows.filter(x => x.decision_bucket === 'future');
  if (state.actionFilter === 'unmatched') rows = rows.filter(x => !x.matched_risk);
  if (state.actionSearch) {
    rows = rows.filter(x => [x.po_no, x.material, x.description, x.supplier].some(v => String(v || '').toLowerCase().includes(state.actionSearch)));
  }
  return rows;
}

function filteredActions() {
  let rows = state.data.supply.actions.slice();
  if (state.actionFilter === 'overdue') rows = rows.filter(x => x.decision_bucket === 'overdue');
  if (state.actionFilter === 'due7') rows = rows.filter(x => ['due_today', 'due_7d'].includes(x.decision_bucket));
  if (state.actionFilter === 'review') rows = rows.filter(x => x.needs_review);
  if (state.actionFilter === 'unscheduled') rows = rows.filter(x => x.decision_bucket === 'unscheduled');
  if (state.actionFilter === 'high_conf') rows = rows.filter(x => x.confidence === '高');
  if (state.actionSearch) {
    rows = rows.filter(x => [x.material, x.description, x.supplier, x.plant].some(v => String(v || '').toLowerCase().includes(state.actionSearch)));
  }
  return rows;
}

/* 供应商交货统计索引 —— 支撑 ±Nd 不确定性标注 */
function supplierStat(name) {
  if (!state._supIndex) {
    const idx = {};
    (state.data.supply.suppliers.items || []).forEach(x => { idx[x.name] = x; });
    state._supIndex = idx;
  }
  return state._supIndex[name] || null;
}

function etaRange(row) {
  const s = supplierStat(row.supplier);
  if (!s || s.p80_delay == null) {
    return { text: '±?', wide: true, tip: '该供应商无交货统计，交期不可估' };
  }
  const d = Math.max(1, Math.round(s.p80_delay));
  return {
    text: '±' + d + 'd',
    wide: d >= 3,
    tip: '供应商近 ' + (s.arrived_orders ?? 0) + ' 单：P80 延误 ' + s.p80_delay + ' 天 · P90 ' + s.p90_delay + ' 天 · 准点率 ' + s.on_time_rate + '%'
  };
}

function poTier(row) {
  const dl = row.days_left;
  if (dl == null) return 't5';
  if (dl < -30) return 't5';
  if (dl <= -5) return 't1';
  if (dl <= -3) return 't2';
  if (dl < 0) return 't3';
  if (dl <= 2) return 't3';
  return 't4';
}

const PO_TIER_NAME = { t1: '严重', t2: '预警', t3: '临期', t4: '正常', t5: '未跟踪' };

function poCause(row) {
  const dl = row.days_left;
  const s = supplierStat(row.supplier);
  const p90 = s && s.p90_delay != null ? s.p90_delay + ' 天' : '无统计';
  if (dl == null) return { text: '无 ETA，需向供应商确认', ghost: true };
  if (dl < -30) return { text: '逾期 ' + Math.abs(dl) + ' 天 · 疑似未清账/未关闭，非交期问题', ghost: true };
  if (dl < 0) return { text: '逾期 ' + Math.abs(dl) + ' 天 · 供应商 P90 延误 ' + p90, ghost: false };
  if (dl <= 2) return { text: '临期 · 供应商 P90 延误 ' + p90, ghost: false };
  return { text: '在途正常 · 供应商准点率 ' + (s && s.on_time_rate != null ? s.on_time_rate + '%' : '无统计'), ghost: false };
}

function renderActionTable() {
  const table = $('#actionTable');
  if (state.procurementMode === 'chase') {
    const rows = filteredPOs();
    table.innerHTML = `
      <thead><tr><th>PO</th><th>物料</th><th>供应商</th><th>预计到货</th><th>档位</th><th class="num">剩余</th><th class="num">未交量 kg</th><th>判断依据</th><th>操作</th></tr></thead>
      <tbody>${rows.map((row, index) => {
        const tier = poTier(row);
        const eta = etaRange(row);
        const cause = poCause(row);
        const idx = state.data.supply.purchase_orders.items.indexOf(row);
        return `
        <tr data-po-index="${idx}">
          <td><span class="strong">${esc(row.po_no)}</span><span class="sub">${esc(row.srm_po || '无 SRM 单号')}</span></td>
          <td><span class="strong">${esc(row.material)}</span><span class="sub">${esc(row.description)}</span></td>
          <td>${esc(row.supplier)}</td>
          <td><span class="eta-cell">${dateText(row.eta_date)}<span class="eta-range ${eta.wide ? 'wide' : ''}" title="${esc(eta.tip)}">${eta.text}</span></span></td>
          <td><span class="badge ${tier}">${PO_TIER_NAME[tier]}</span></td>
          <td class="num ${row.days_left < 0 ? 'delta-neg' : ''}">${row.days_left == null ? '—' : row.days_left}</td>
          <td class="num">${compact(row.open_qty, 0)}</td>
          <td><span class="row-cause ${cause.ghost ? 'ghost' : ''}">${esc(cause.text)}</span></td>
          <td>${tier === 't5'
            ? `<button class="btn small chase-btn" data-chase-index="${idx}" data-chase-kind="check">去核对</button>`
            : `<button class="btn small chase-btn" data-chase-index="${idx}">催办</button>`}</td>
        </tr>`;
      }).join('') || '<tr><td colspan="9"><div class="empty-state">没有符合条件的催货记录</div></td></tr>'}</tbody>
    `;
    $$('#actionTable tbody tr[data-po-index]').forEach(tr => {
      tr.addEventListener('click', () => openPO(state.data.supply.purchase_orders.items[Number(tr.dataset.poIndex)]));
    });
    $$('#actionTable .chase-btn').forEach(button => {
      button.addEventListener('click', event => {
        event.stopPropagation();
        const kind = button.dataset.chaseKind === 'check' ? '核对' : '催办';
        button.textContent = '已记录';
        button.disabled = true;
        showToast(kind + '已记录 · ' + new Date().toLocaleTimeString('zh-CN', { hour12: false }));
      });
    });
  } else {
    const rows = filteredActions();
    table.innerHTML = `
      <thead><tr><th>物料</th><th>供应商</th><th>建议下单</th><th class="num">可用 / 补货点</th><th class="num">在途</th><th class="num">缓冲量</th><th class="num">安全库存</th><th class="num col-key">建议补货量</th><th class="num">新旧对比</th><th>置信度</th></tr></thead>
      <tbody>${rows.map(row => {
        const tier = tierOf(row);
        const rp = row.reorder_point || 0;
        const ratio = rp > 0 ? Math.min(100, (row.available / rp) * 100) : 0;
        const full = ratio >= 100;
        const toneVar = tier === 't1' ? 'var(--t1)' : tier === 't2' ? 'var(--t2)' : tier === 't3' ? 'var(--t3)' : tier === 't4' ? 'var(--t4)' : 'var(--t5)';
        return `
        <tr data-action-key="${esc(row.key)}">
          <td><span class="strong">${esc(row.material)}</span><span class="row-note">${esc(row.description)} · ${esc(row.plant)}</span></td>
          <td>${esc(row.supplier)}</td>
          <td>${row.must_order_by ? `<span title="${esc(row.must_order_by)}">${esc(String(row.must_order_by).slice(5))}</span>` : '<span class="badge t3">待排期</span>'}</td>
          <td><span class="stock-cell ${full ? 'full' : ''}"><span class="stock-num">${num(row.available, 0)}</span><span class="stock-target">/${num(rp, 0)}</span><span class="stock-track"><span class="stock-fill" style="width:${ratio.toFixed(0)}%;background:${full ? 'var(--green)' : toneVar}"></span></span></span></td>
          <td class="num">${num(row.incoming, 0)}</td>
          <td class="num">${num(row.buffer_qty, 0)}</td>
          <td class="num">${num(row.safety_stock, 0)}</td>
          <td class="num col-key">${num(row.suggested_replenishment, 0)}</td>
          <td class="num ${row.replenishment_delta_pct > 50 ? 'delta-warn' : ''}">${row.replenishment_delta_pct == null ? '—' : (row.replenishment_delta_pct > 0 ? '+' : '') + row.replenishment_delta_pct.toFixed(1) + '%'}</td>
          <td><span class="badge ${row.confidence === '高' ? 'green' : row.confidence === '低' ? 'red' : 'blue'}">${esc(row.confidence || '—')}</span></td>
        </tr>`;
      }).join('') || '<tr><td colspan="10"><div class="empty-state">没有符合条件的补单建议</div></td></tr>'}</tbody>
    `;
    $$('#actionTable tbody tr[data-action-key]').forEach(tr => {
      tr.addEventListener('click', () => {
        const action = state.data.supply.actions.find(x => x.key === tr.dataset.actionKey);
        if (action) openAction(action);
      });
    });
  }
}

function renderAtpPanel() {
  const d = state.data;
  const materials = d.supply.materials;
  const totalAtp = materials.reduce((sum, m) => sum + (m.atp_commit_qty || 0), 0);
  const zero = materials.filter(m => (m.atp_commit_qty || 0) <= 0).length;
  const avgDays = materials.filter(m => m.atp_days != null).reduce((sum, m) => sum + m.atp_days, 0) / Math.max(1, materials.filter(m => m.atp_days != null).length);
  const low = [...materials].sort((a, b) => (a.atp_days ?? 99999) - (b.atp_days ?? 99999)).slice(0, 4);
  $('#atpPanel').innerHTML = `
    <div class="panel-head"><div><span class="eyebrow">Supply ATP</span><h3>ATP 可承诺量</h3></div><span class="badge blue">供应侧</span></div>
    <div class="mini-metric-grid">
      <div class="mini-metric"><span>ATP 合计</span><strong>${compact(totalAtp, 1)}</strong></div>
      <div class="mini-metric"><span>ATP 为 0</span><strong class="red">${zero}</strong></div>
      <div class="mini-metric"><span>平均 ATP 天数</span><strong>${avgDays.toFixed(1)}</strong></div>
      <div class="mini-metric"><span>有效物料</span><strong>${materials.length}</strong></div>
    </div>
    <p class="side-note">ATP = 当前可用 + 在途 − 安全库存。当前无销售订单占用，因此这是供应侧可承诺量。</p>
    <div class="side-list" style="margin-top:10px">
      ${low.map(m => `<button class="side-list-row" data-atp-key="${esc(m.key)}"><span>${esc(m.material)} · ${esc(m.plant)}</span><strong>${m.atp_days == null ? '—' : m.atp_days.toFixed(1) + '天'}</strong></button>`).join('')}
    </div>
  `;
  $$('#atpPanel [data-atp-key]').forEach(button => button.addEventListener('click', () => {
    const material = materials.find(m => m.key === button.dataset.atpKey);
    if (material) openMaterial(material);
  }));
}

function renderSideActions() {
  const top = state.data.supply.actions.slice(0, 5);
  $('#sideActions').innerHTML = `
    <div class="panel-head"><div><span class="eyebrow">Today</span><h3>今日补单建议</h3></div><button class="text-btn" data-side-all>全部</button></div>
    <div class="side-list">${top.map(a => {
      const tier = tierOf(a);
      return `
      <button class="side-list-row" data-side-action="${esc(a.key)}">
        <span>${esc(a.material)} · ${esc(a.plant)}<span class="row-cause">${esc(a.action_text || '按缺口补单')}${a.must_order_by ? ' · 建议 ' + esc(a.must_order_by) + ' 前下单' : ''}</span></span>
        <strong class="badge ${tier}" style="font-family:inherit">${compact(a.suggested_replenishment, 0)}</strong>
      </button>`;
    }).join('')}</div>
    <div class="prov-row"><b>依据</b>目标库存 = 安全库存 + 缓冲量 + 提前期需求<span class="prov-sep"></span><span>建议量已扣除在途</span></div>
  `;
  $$('#sideActions [data-side-action]').forEach(button => button.addEventListener('click', () => {
    const action = state.data.supply.actions.find(x => x.key === button.dataset.sideAction);
    if (action) openAction(action);
  }));
  $('#sideActions [data-side-all]').addEventListener('click', () => {
    state.procurementMode = 'replenish';
    state.actionFilter = 'all';
    renderProcurementMode();
  });
}

function renderSideQuality() {
  const d = state.data;
  const derived = d.data_quality.derived;
  $('#sideQuality').innerHTML = `
    <div class="panel-head"><div><span class="eyebrow">Trust</span><h3>数据质量提醒</h3></div><span class="badge amber">优先核查</span></div>
    <div class="side-list">
      <div class="side-list-row"><span>缺 MB51 收货</span><strong>${derived.missing_mb51_receipts ?? 0} 行</strong></div>
      <div class="side-list-row"><span>未匹配风险表 PO</span><strong>${d.supply.purchase_orders.summary.unmatched_risk} 张</strong></div>
      <div class="side-list-row"><span>低置信度行动</span><strong>${d.supply.actions.filter(a => a.confidence === '低').length} 项</strong></div>
      <div class="side-list-row"><span>全部复核提示</span><strong>${d.supply.actions.filter(a => a.has_review_note).length} 项</strong></div>
    </div>
    <p class="side-note">缺收货会导致供应商准时率被低估，页面不把缺收货供应商直接判定为高风险。</p>
  `;
}

function renderSupply() {
  const d = state.data;
  $$('#supplierGroups .seg').forEach(button => {
    button.classList.toggle('active', button.dataset.group === state.supplierGroup);
    button.setAttribute('aria-selected', String(button.dataset.group === state.supplierGroup));
    button.addEventListener('click', () => {
      state.supplierGroup = button.dataset.group;
      renderSupplyMode();
    });
  });
  $('#supplierSearch')?.addEventListener('input', event => {
    state.supplierSearch = event.target.value.trim().toLowerCase();
    renderSupplierTable();
  });
  $('#supplierRiskFilter')?.addEventListener('change', event => {
    state.supplierRisk = event.target.value;
    renderSupplierTable();
  });
  $('#supplierAllBtn')?.addEventListener('click', () => {
    document.getElementById('supplierTable')?.closest('.panel')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
  $('#supplierMethodBtn')?.addEventListener('click', openSupplierMethod);
  renderSupplierOverview();
  renderSupplyMode();
  renderSupplierRank();
  renderSupplierTable();
  renderWarehouse();
}

function renderSupplierOverview() {
  const d = state.data;
  const suppliers = d.supply.suppliers.items;
  const arrived = suppliers.reduce((sum, s) => sum + (s.arrived_orders || 0), 0);
  const onTime = suppliers.reduce((sum, s) => sum + (s.on_time_orders || 0), 0);
  const weightedRate = arrived > 0 ? onTime / arrived * 100 : 0;
  const po = d.supply.purchase_orders.summary;
  if ($('#supplierKpis')) {
    $('#supplierKpis').innerHTML = `
      <article class="home-kpi"><div class="home-kpi-label">合作供应商</div><div class="home-kpi-value blue">${d.supply.suppliers.total}<small>家</small></div><div class="home-kpi-foot">已定位 ${d.supply.geo.located} 家</div></article>
      <article class="home-kpi"><div class="home-kpi-label">在途批次</div><div class="home-kpi-value blue">${po.total}<small>批</small></div><div class="home-kpi-foot">未交总量 ${compact(po.open_qty, 0)} kg</div></article>
      <article class="home-kpi"><div class="home-kpi-label">交付准时率</div><div class="home-kpi-value green">${weightedRate.toFixed(1)}<small>%</small></div><div class="home-kpi-foot">按已到货订单加权</div></article>
      <article class="home-kpi"><div class="home-kpi-label">超期未交付</div><div class="home-kpi-value amber">${po.overdue}<small>批</small></div><div class="home-kpi-foot">2 天内到货 ${po.due_2d} 批</div></article>
    `;
  }
  const regionRows = (d.supply.geo.provinces || []).slice().sort((a, b) => b.supplier_count - a.supplier_count).slice(0, 5);
  if ($('#supplierRegions')) {
    $('#supplierRegions').innerHTML = `
      <div class="panel-head"><div><span class="eyebrow">Supplier regions</span><h3>供应来源区域分布</h3></div><span class="panel-note">按供应商名称识别 · 不猜测</span></div>
      <div class="supplier-region-grid">${regionRows.map((region, index) => `<div class="supplier-region-card ${index === 0 ? 'primary' : ''}"><span>${esc(region.name)}</span><strong>${region.supplier_count}<small> 家</small></strong><em>订单 ${region.orders} · 缺收货 ${region.missing_receipts}</em></div>`).join('') || '<div class="empty-state">暂无地域数据</div>'}</div>
    `;
  }
}

function renderSupplyMode() {
  $$('#supplierGroups .seg').forEach(button => {
    button.classList.toggle('active', button.dataset.group === state.supplierGroup);
    button.setAttribute('aria-selected', String(button.dataset.group === state.supplierGroup));
  });
  renderSupplierCards();
}

function sortedSuppliers(group) {
  const rows = state.data.supply.suppliers.items.slice();
  if (group === 'ontime') rows.sort((a, b) => (b.on_time_rate ?? -1) - (a.on_time_rate ?? -1));
  else if (group === 'scale') rows.sort((a, b) => (b.orders ?? 0) - (a.orders ?? 0));
  else if (group === 'missing') rows.sort((a, b) => (b.missing_receipts ?? 0) - (a.missing_receipts ?? 0));
  else rows.sort((a, b) => (b.delivery_health_score ?? 0) - (a.delivery_health_score ?? 0));
  return rows;
}

function renderSupplierCards() {
  const top = sortedSuppliers(state.supplierGroup).slice(0, 6);
  $('#supplierCards').innerHTML = top.map(supplier => {
    const group = supplier.product_groups?.[0]?.name || '未分组';
    const region = supplier.region_province || '未定位';
    return `
      <button class="supplier-card" data-supplier-name="${esc(supplier.name)}">
        <div class="supplier-card-head">
          <div><div class="supplier-name">${esc(supplier.name)}</div><div class="supplier-meta">${esc(region)} · ${esc(group)}</div></div>
          <span class="badge ${supplier.risk_label === '低风险' ? 'green' : supplier.risk_label === '需关注' ? 'amber' : 'red'}">${esc(supplier.risk_label)}</span>
        </div>
        <div class="supplier-score-row"><div class="supplier-score">${(supplier.delivery_health_score ?? 0).toFixed(1)}<small>交付健康分</small></div><div class="stars" aria-label="${supplier.stars} 星">${stars(supplier.stars)}</div></div>
        <div class="supplier-facts">
          <div class="supplier-fact"><span>履约能力</span><strong>准时率 ${pct(supplier.on_time_rate)} · 中位延迟 ${supplier.median_delay ?? '—'} 天</strong></div>
          <div class="supplier-fact"><span>供应品类</span><strong>${esc(group)} · ${supplier.orders} 单</strong></div>
          <div class="supplier-fact"><span>合作规模</span><strong>${supplier.orders} 单 · 分批到货 ${pct(supplier.split_rate)}</strong></div>
          <div class="supplier-fact"><span>交付周期</span><strong>中位 ${supplier.median_lead ?? '—'} 天 · P90 ${supplier.p90_delay ?? '—'} 天</strong></div>
        </div>
        <div class="supplier-card-foot"><span>缺收货 <strong>${supplier.missing_receipts ?? 0}</strong> 单</span><span>关联 <strong>${supplier.related_material_count ?? 0}</strong> 物料</span></div>
      </button>
    `;
  }).join('');
  $$('#supplierCards [data-supplier-name]').forEach(button => button.addEventListener('click', () => {
    const supplier = state.data.supply.suppliers.items.find(x => x.name === button.dataset.supplierName);
    if (supplier) openSupplier(supplier);
  }));
}

function renderSupplierRank() {
  const top = [...state.data.supply.suppliers.items]
    .sort((a, b) => (a.delivery_health_score ?? 0) - (b.delivery_health_score ?? 0))
    .slice(0, 6);
  $('#supplierRank').innerHTML = top.map((supplier, index) => `
    <button class="rank-row" data-rank-supplier="${esc(supplier.name)}">
      <span class="rank-no">${index + 1}</span>
      <span class="rank-main"><strong>${esc(supplier.name)}</strong><span>准时率 ${pct(supplier.on_time_rate)} · 缺收货 ${supplier.missing_receipts}</span></span>
      <span class="rank-value ${supplier.delivery_health_score < 65 ? 'red' : ''}">${supplier.delivery_health_score.toFixed(1)}</span>
    </button>
  `).join('');
  $$('#supplierRank [data-rank-supplier]').forEach(button => button.addEventListener('click', () => {
    const supplier = state.data.supply.suppliers.items.find(x => x.name === button.dataset.rankSupplier);
    if (supplier) openSupplier(supplier);
  }));
  const geo = state.data.supply.geo;
  $('#geoNote').textContent = '已定位 ' + geo.located + ' / ' + geo.total;
}

function matchedSuppliers() {
  let rows = state.data.supply.suppliers.items.slice();
  if (state.supplierSearch) {
    rows = rows.filter(s => [s.name, s.region_province, ...(s.product_groups || []).map(g => g.name)].some(v => String(v || '').toLowerCase().includes(state.supplierSearch)));
  }
  if (state.supplierRisk) rows = rows.filter(s => s.risk_label === state.supplierRisk);
  return rows.sort((a, b) => (b.delivery_health_score ?? 0) - (a.delivery_health_score ?? 0));
}

function renderSupplierTable() {
  const rows = matchedSuppliers();
  $('#supplierTable').innerHTML = `
    <thead><tr><th>供应商</th><th>区域</th><th>主供品类</th><th class="num">健康分</th><th class="num">准时率</th><th class="num">中位延迟</th><th class="num">P90延迟</th><th class="num">订单</th><th class="num">缺收货</th></tr></thead>
    <tbody>${rows.map(supplier => `
      <tr data-supplier-row="${esc(supplier.name)}">
        <td><span class="strong">${esc(supplier.name)}</span><span class="sub">${esc(supplier.risk_label)}</span></td>
        <td>${esc(supplier.region_province || '未定位')}</td>
        <td>${esc(supplier.product_groups?.[0]?.name || '未分组')}</td>
        <td class="num strong">${(supplier.delivery_health_score ?? 0).toFixed(1)}</td>
        <td class="num">${pct(supplier.on_time_rate)}</td>
        <td class="num">${supplier.median_delay ?? '—'}</td>
        <td class="num">${supplier.p90_delay ?? '—'}</td>
        <td class="num">${supplier.orders}</td>
        <td class="num ${supplier.missing_receipts > 0 ? 'delta-warn' : ''}">${supplier.missing_receipts}</td>
      </tr>
    `).join('') || '<tr><td colspan="9"><div class="empty-state">没有符合条件的供应商</div></td></tr>'}</tbody>
  `;
  $$('#supplierTable [data-supplier-row]').forEach(tr => tr.addEventListener('click', () => {
    const supplier = state.data.supply.suppliers.items.find(x => x.name === tr.dataset.supplierRow);
    if (supplier) openSupplier(supplier);
  }));
}

function renderWarehouse() {
  const d = state.data;
  const w = d.warehouse;
  if (!w?.available) {
    $('#warehouseSection').innerHTML = '<section class="panel" style="grid-column:1/-1"><div class="empty-state">暂无仓储数据</div></section>';
    return;
  }
  const s = w.summary;
  const locations = (w.locations || []).slice(0, 10);
  $('#warehouseSection').innerHTML = `
    <section class="panel">
      <div class="panel-head"><div><span class="eyebrow">Warehouse</span><h3>库存与资金</h3></div><span class="panel-note">工厂 ${d.meta.mode === 'competition' ? '1501' : '全部'}</span></div>
      <div class="warehouse-kpis">
        <div class="warehouse-kpi"><span>库存金额</span><strong>${money(s.inventory_amount)}</strong></div>
        <div class="warehouse-kpi"><span>可用库存</span><strong>${compact(s.available_qty, 1)}<small> kg</small></strong></div>
        <div class="warehouse-kpi"><span>线边库存</span><strong>${compact(s.line_side_qty, 1)}<small> kg</small></strong></div>
        <div class="warehouse-kpi"><span>最老库龄</span><strong>${num(s.oldest_age_days, 0)}<small> 天</small></strong></div>
      </div>
      <div class="table-wrap" style="max-height:330px">
        <table class="data-table warehouse-location-table">
          <thead><tr><th>库存地点</th><th>名称</th><th class="num">批次</th><th class="num">可用 kg</th><th class="num">金额</th><th class="num">最老库龄</th></tr></thead>
          <tbody>${locations.map(loc => `<tr><td class="strong">${esc(loc.location)}</td><td>${esc(loc.location_name)}</td><td class="num">${loc.batch_rows}</td><td class="num">${compact(loc.available_qty, 1)}</td><td class="num">${money(loc.inventory_amount)}</td><td class="num">${num(loc.oldest_age_days,0)}</td></tr>`).join('')}</tbody>
        </table>
      </div>
    </section>
    <section class="panel">
      <div class="panel-head"><div><span class="eyebrow">Inventory age</span><h3>库龄结构</h3></div><span class="panel-note">按批次</span></div>
      <div class="chart" id="agingChart" style="height:330px"></div>
      <p class="side-note">超过 365 天的批次单独标注，用于判断呆滞与资金占用。</p>
    </section>
    <section class="panel" style="grid-column:1/-1">
      <div class="panel-head"><div><span class="eyebrow">Inventory footprint</span><h3>库存地点分布</h3></div><span class="panel-note">${s.batch_rows} 批次 · ${s.sku_plant_count} SKU/工厂</span></div>
      <div class="table-wrap" style="max-height:320px">
        <table class="data-table" style="min-width:760px">
          <thead><tr><th>工厂</th><th>库存地点</th><th>名称</th><th class="num">批次</th><th class="num">可用 kg</th><th class="num">库存金额</th><th class="num">最老库龄</th></tr></thead>
          <tbody>${(w.locations || []).slice(0,6).map(loc => `<tr><td>${esc(loc.plant)}</td><td class="strong">${esc(loc.location)}</td><td>${esc(loc.location_name)}</td><td class="num">${loc.batch_rows}</td><td class="num">${compact(loc.available_qty,1)}</td><td class="num">${money(loc.inventory_amount)}</td><td class="num">${num(loc.oldest_age_days,0)}</td></tr>`).join('')}</tbody>
        </table>
      </div>
    </section>
  `;
}

function normalizeRegionName(value) {
  return String(value || '').replace(/(维吾尔|壮族|回族|特别行政区|自治区|自治州|省|市)/g, '').trim();
}

function supplierRiskKey(label) {
  const text = String(label || '');
  if (text.includes('高') || text.includes('紧急')) return 'red';
  if (text.includes('关注')) return 'orange';
  if (text.includes('低') || text.includes('正常')) return 'ok';
  return 'yellow';
}

function riskPriority(key) {
  return { red: 4, orange: 3, yellow: 2, ok: 1 }[key] || 0;
}

function buildSupplierMapModel() {
  const d = state.data;
  const geo = d.supply.geo || {};
  const suppliers = d.supply.suppliers.items || [];
  const cityCoords = new Map((geo.cities || []).map(city => [
    normalizeRegionName(city.province) + '|' + normalizeRegionName(city.name),
    city,
  ]));
  const cityGroups = new Map();
  const provinceGroups = new Map();

  suppliers.forEach(supplier => {
    const province = normalizeRegionName(supplier.region_province);
    const city = normalizeRegionName(supplier.region_city);
    const risk = supplierRiskKey(supplier.risk_label);
    if (province) {
      const p = provinceGroups.get(province) || { supplierCount: 0, criticalCount: 0, watchCount: 0, orders: 0, missingReceipts: 0, suppliers: [], risks: [] };
      p.supplierCount += 1;
      p.criticalCount += risk === 'red' ? 1 : 0;
      p.watchCount += risk === 'orange' || risk === 'yellow' ? 1 : 0;
      p.orders += Number(supplier.orders || 0);
      p.missingReceipts += Number(supplier.missing_receipts || 0);
      p.suppliers.push(supplier);
      p.risks.push(risk);
      provinceGroups.set(province, p);
    }
    if (!province || !city) return;
    const coord = cityCoords.get(province + '|' + city);
    if (!coord) return;
    const key = province + '|' + city;
    const group = cityGroups.get(key) || {
      id: key,
      name: coord.name,
      province: coord.province,
      lon: Number(coord.lon),
      lat: Number(coord.lat),
      supplierCount: 0,
      orders: Number(coord.orders || 0),
      missingReceipts: Number(coord.missing_receipts || 0),
      onTimeValues: [],
      suppliers: [],
      risks: [],
    };
    group.supplierCount += 1;
    group.orders += Number(supplier.orders || 0);
    group.missingReceipts += Number(supplier.missing_receipts || 0);
    if (Number.isFinite(Number(supplier.on_time_rate))) group.onTimeValues.push(Number(supplier.on_time_rate));
    group.suppliers.push(supplier);
    group.risks.push(risk);
    cityGroups.set(key, group);
  });

  const cities = [...cityGroups.values()].map(group => {
    const risk = group.risks.sort((a, b) => riskPriority(b) - riskPriority(a))[0] || 'ok';
    return {
      ...group,
      risk,
      avgOnTime: group.onTimeValues.length ? group.onTimeValues.reduce((sum, value) => sum + value, 0) / group.onTimeValues.length : null,
    };
  }).sort((a, b) => b.supplierCount - a.supplierCount || a.name.localeCompare(b.name, 'zh-CN'));

  const provinces = (geo.provinces || []).map(province => {
    const group = provinceGroups.get(normalizeRegionName(province.name)) || { suppliers: [], risks: [] };
    const risk = group.risks.slice().sort((a, b) => riskPriority(b) - riskPriority(a))[0] || 'ok';
    return {
      ...province,
      risk,
      riskLabel: { red: '高风险', orange: '需关注', yellow: '关注', ok: '正常' }[risk],
      supplierCount: group.supplierCount || Number(province.supplier_count || 0),
      criticalCount: group.criticalCount || 0,
      watchCount: group.watchCount || 0,
      orders: province.orders || group.orders || 0,
      missingReceipts: province.missing_receipts || group.missingReceipts || 0,
      suppliers: group.suppliers || [],
    };
  });

  return { cities, provinces, total: geo.total || suppliers.length, located: geo.located || cities.length };
}

function renderSupplierMapDetail(selection) {
  const detail = $('#supplierMapDetail');
  if (!detail) return;
  const model = buildSupplierMapModel();
  if (!selection) {
    detail.hidden = true;
    detail.innerHTML = '';
    return;
  }
  const list = selection.type === 'city'
    ? selection.data.suppliers || []
    : selection.data?.suppliers || [];
  const title = selection.type === 'city'
    ? selection.data.name + ' · 城市供应结构'
    : selection.name + ' · 省级供应结构';
  detail.hidden = false;
  detail.innerHTML = `
    <div class="supplier-map-detail-head"><strong>${esc(title)}</strong><span>${list.length} 家已定位供应商</span></div>
    <div class="supplier-map-detail-list">${list.slice(0, 8).map(supplier => `<button type="button" data-map-supplier="${esc(supplier.name)}"><span>${esc(supplier.name)}</span><em>${esc(supplier.risk_label)} · 准时率 ${pct(supplier.on_time_rate)} · 缺收货 ${supplier.missing_receipts ?? 0}</em></button>`).join('') || '<div class="empty-state">该区域暂无已定位供应商。</div>'}</div>
  `;
  $$('#supplierMapDetail [data-map-supplier]').forEach(button => button.addEventListener('click', () => {
    const supplier = state.data.supply.suppliers.items.find(item => item.name === button.dataset.mapSupplier);
    if (supplier) openSupplier(supplier);
  }));
}

async function renderChinaMap() {
  const geo = state.data.supply.geo;
  if (!geo || !geo.provinces?.length) {
    $('#chinaMap').innerHTML = '<div class="empty-state">暂无地域数据</div>';
    return;
  }
  if (!window.CHINA_GEO || !window.SUPPLIER_MAP) {
    $('#chinaMap').innerHTML = '<div class="empty-state">本地 SVG 地图资源加载失败</div>';
    return;
  }
  try {
    const model = buildSupplierMapModel();
    const note = $('#geoNote');
    if (note) note.textContent = '已定位 ' + model.located + ' / ' + model.total + ' · 省级风险聚合';
    $('#chinaMap').innerHTML = `
      <div class="sm-map-shell">
        <div class="sm-map-wrap"><div class="sm-map-tip" role="status" aria-live="polite"></div><div class="sm-map-stage"></div></div>
      </div>`;
    const stage = $('#chinaMap .sm-map-stage');
    stage.innerHTML = window.SUPPLIER_MAP.buildMap(model);
    window.SUPPLIER_MAP.bindMap($('#chinaMap'), model, {
      onSelect: selection => renderSupplierMapDetail(selection),
    });
  } catch (error) {
    console.error(error);
    $('#chinaMap').innerHTML = '<div class="empty-state">地图渲染失败</div>';
  }
}

function renderAgingChart() {
  if (!document.getElementById('agingChart')) return;
  const data = state.data.warehouse.aging || [];
  ensureChart('agingChart', {
    ...chartTheme(),
    grid: { left: 42, right: 18, top: 18, bottom: 32 },
    xAxis: { type: 'category', data: data.map(x => x.bucket), axisLine: { lineStyle: { color: CHART_AXIS } }, axisTick: { show: false }, axisLabel: { fontSize: 11, color: CHART_LABEL } },
    yAxis: { type: 'value', splitLine: { lineStyle: { color: CHART_GRID, type: 'solid' } }, axisLabel: { fontSize: 11, color: CHART_LABEL } },
    series: [{ type: 'bar', barWidth: 22, data: data.map((x, index) => ({ value: x.count, itemStyle: { color: CHART_COLORS[index] || CHART_COLORS[0], borderRadius: 0 } })), label: { show: true, position: 'top', fontSize: 11, color: CHART_LABEL } }],
  });
}


function hasMarketChange(change) {
  return change !== null && change !== undefined && change !== '' && Number.isFinite(Number(change));
}

function marketDirection(change) {
  if (!hasMarketChange(change)) return { label: '未标注', cls: 'neutral' };
  const value = Number(change);
  if (value > 0) return { label: '上涨', cls: 'up' };
  if (value < 0) return { label: '回落', cls: 'down' };
  return { label: '持稳', cls: 'flat' };
}

function marketChangeText(change) {
  if (!hasMarketChange(change)) return '涨跌未标注';
  const value = Number(change);
  return `${value > 0 ? '+' : ''}${value.toFixed(2)}%`;
}

function marketPriceText(item) {
  if (item.price == null) return '—';
  return `${num(item.price, Number.isInteger(item.price) ? 0 : 2)}${item.unit ? ' ' + esc(item.unit) : ''}`;
}

function safeMarketUrl(value) {
  const text = String(value || '').trim();
  return /^https?:\/\//i.test(text) ? text : '';
}

const MARKET_LINK_RULES = [
  { label: '丙烯酸及聚合物链', names: ['丙烯酸'], groups: ['羧酸、酐、酰卤、酯及其衍生物', '其他聚合物'], keywords: ['丙烯酸'] },
  { label: '阴离子表活链', names: ['十二烷基苯磺酸钠'], groups: ['阴离子表面活性剂'], keywords: ['十二烷基苯磺酸钠', 'LAS'] },
  { label: '有机硅链', names: ['二甲基环硅氧烷DMC', '二甲基硅油'], groups: ['有机硅聚合物', '硅油消泡剂'], keywords: ['有机硅', '硅油'] },
  { label: '油脂与脂肪醇链', names: ['脂肪醇C12-14', '棕榈油', '脂肪酸', '硬脂酸', '甘油'], groups: ['改性油脂'], keywords: ['脂肪醇', '棕榈油', '脂肪酸', '硬脂酸', '甘油'] },
  { label: 'EO/PO 醇醚链', names: ['环氧乙烷', '环氧丙烷', '乙烯', '丙烯'], groups: ['醇、醚及其衍生物', '环氧加成物', '非离子表面活性剂'], keywords: ['环氧乙烷', '环氧丙烷'] },
  { label: '碱类原料', names: ['液碱'], groups: ['氢氧化物'], keywords: ['液碱', '氢氧化'] },
  { label: '芳烃与基础原料', names: ['苯乙烯'], groups: ['其他芳香族'], keywords: ['苯乙烯'] },
];

function normalizeMarketChange(item) {
  const raw = item?.change_pct;
  if (raw === null || raw === undefined || raw === '') return null;
  const value = Number(String(raw).replace('%', ''));
  return Number.isFinite(value) ? value : null;
}

function marketChangeLabel(change) {
  if (change === null) return { label: '未标注', cls: 'neutral' };
  if (change > 0.2) return { label: '上行', cls: 'up' };
  if (change < -0.2) return { label: '回落', cls: 'down' };
  return { label: '暂稳', cls: 'flat' };
}

function pickMarketItemForRule(rule, items) {
  const candidates = rule.names
    .map(name => items.find(item => String(item.name || '').trim() === String(name).trim()))
    .filter(Boolean);
  return candidates.slice().sort((a, b) => Math.abs(normalizeMarketChange(b) ?? 0) - Math.abs(normalizeMarketChange(a) ?? 0))[0] || null;
}

function buildMarketCrossSignals(items) {
  const materials = state.data.supply.materials || [];
  const groups = new Map();
  const matchedMaterialKeys = new Set();
  for (const material of materials) {
    const description = String(material.description || '');
    const group = String(material.product_group || '');
    const direct = items.find(item => description.includes(String(item.name || ''))) || null;
    const rule = MARKET_LINK_RULES.find(r => r.groups.includes(group) || r.keywords.some(k => description.includes(k)));
    const item = rule ? pickMarketItemForRule(rule, items) : direct;
    if (!item) continue;
    const label = rule ? rule.label : (String(item.name || '') + ' 对应物料');
    const stateGroup = groups.get(label) || { label, item, materials: [], criticalCount: 0, priorityCount: 0, coverageMin: null };
    stateGroup.materials.push(material);
    const tier = tierOf(material);
    stateGroup.criticalCount += tier === 't1' ? 1 : 0;
    stateGroup.priorityCount += tier === 't2' || tier === 't3' ? 1 : 0;
    const coverage = Number(material.coverage_days);
    if (Number.isFinite(coverage)) stateGroup.coverageMin = stateGroup.coverageMin == null ? coverage : Math.min(stateGroup.coverageMin, coverage);
    groups.set(label, stateGroup);
    matchedMaterialKeys.add(material.key);
  }
  const signals = [...groups.values()].map(signal => {
    const change = normalizeMarketChange(signal.item);
    const direction = marketChangeLabel(change);
    let conclusion = '外部信号暂稳，继续按内部补货节奏执行。';
    let action = '按计划执行';
    let tone = 'calm';
    if (signal.criticalCount > 0 && change !== null && change > 0.2) {
      conclusion = '外部成本上行且内部存在严重缺料，建议优先锁价并确认交期。';
      action = '优先锁价，同步确认交期';
      tone = 'critical';
    } else if (signal.criticalCount > 0) {
      conclusion = '外部价格未明显上涨，内部缺口是主矛盾，优先补货而非等待价格。';
      action = '优先保供，不等待降价';
      tone = 'critical';
    } else if (change !== null && change > 0.2) {
      conclusion = '内部暂无严重缺口，但成本有上行迹象，建议控制追高并关注替代。';
      action = '控制追高，关注替代';
      tone = 'watch';
    } else if (change !== null && change < -0.2) {
      conclusion = '外部价格回落，成本压力缓和，可按计划采购并择机锁价。';
      action = '按计划采购，择机锁价';
      tone = 'watch';
    } else if (signal.priorityCount > 0) {
      action = '保持关注，优先处理预警';
      tone = 'watch';
    }
    return { ...signal, change, direction, conclusion, action, tone };
  }).sort((a, b) => b.criticalCount - a.criticalCount || (Math.abs(b.change ?? 0) - Math.abs(a.change ?? 0)) || b.materials.length - a.materials.length);
  const validChanges = items.map(normalizeMarketChange).filter(v => v !== null);
  const stats = {
    itemCount: items.length,
    changedCount: validChanges.length,
    risingCount: validChanges.filter(v => v > 0.2).length,
    fallingCount: validChanges.filter(v => v < -0.2).length,
    avgChange: validChanges.length ? validChanges.reduce((sum, v) => sum + v, 0) / validChanges.length : null,
    matchedMaterials: matchedMaterialKeys.size,
    matchedGroups: signals.length,
  };
  return { signals, stats };
}
const MARKET_SHOWCASE_NAMES = ['布伦特原油', '乙烯', '丙烯', '甲醇', '乙二醇', '苯乙烯', '棕榈油', '丙烯酸', '液碱', '十二烷基苯磺酸钠'];
const MARKET_FEATURED_NAMES = ['布伦特原油', '乙烯', '苯乙烯'];
const MARKET_PROJECTION_DAYS = ['今日', '+1', '+2', '+3', '+4', '+5', '+6'];

function marketShowcaseItems(items, limit = 10) {
  const byName = new Map(items.map(item => [String(item.name || ''), item]));
  const picked = [];
  MARKET_SHOWCASE_NAMES.forEach(name => {
    const item = byName.get(name);
    if (item) picked.push(item);
  });
  const rest = items
    .filter(item => !picked.some(existing => existing.name === item.name))
    .slice()
    .sort((a, b) => Math.abs(normalizeMarketChange(b) ?? 0) - Math.abs(normalizeMarketChange(a) ?? 0));
  return picked.concat(rest).slice(0, limit);
}

function marketFeaturedItems(items) {
  const byName = new Map(items.map(item => [String(item.name || ''), item]));
  const picked = MARKET_FEATURED_NAMES.map(name => byName.get(name)).filter(Boolean);
  return (picked.length ? picked : items.slice(0, 3)).slice(0, 3);
}

function marketProjectionSeries(item) {
  const price = Number(item?.price);
  if (!Number.isFinite(price) || price <= 0) return [];
  const change = normalizeMarketChange(item) ?? 0;
  const dailyMove = Math.max(-1.2, Math.min(1.2, change * 0.35));
  return MARKET_PROJECTION_DAYS.map((label, day) => ({
    label,
    value: price * Math.pow(1 + dailyMove / 100, day),
  }));
}

function marketPriceDigits(item) {
  const price = Number(item?.price);
  if (!Number.isFinite(price) || Number.isInteger(price)) return 0;
  return Math.abs(price * 100 - Math.round(price * 100)) < 0.0001 ? 2 : 1;
}

function marketProjectionColor(item) {
  const direction = marketDirection(item?.change_pct).cls;
  if (direction === 'up') return '#A33A2A';
  if (direction === 'down') return '#4F7C65';
  return '#7B8880';
}

function marketProjectionSvg(item, index) {
  const series = marketProjectionSeries(item);
  if (!series.length) return '<div class="market-chart-empty">暂无可绘制价格</div>';
  const base = Number(item.price);
  const digits = marketPriceDigits(item);
  const width = 320;
  const height = 104;
  const paddingX = 10;
  const paddingTop = 11;
  const paddingBottom = 15;
  const values = series.map(point => point.value);
  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);
  const spread = Math.max(rawMax - rawMin, Math.abs(base) * 0.001, 0.01);
  const min = rawMin - spread * 0.18;
  const max = rawMax + spread * 0.18;
  const plotWidth = width - paddingX * 2;
  const plotHeight = height - paddingTop - paddingBottom;
  const points = series.map((point, pointIndex) => ({
    ...point,
    x: paddingX + (plotWidth * pointIndex) / (series.length - 1),
    y: paddingTop + ((max - point.value) / (max - min)) * plotHeight,
  }));
  const path = points.map((point, pointIndex) => `${pointIndex ? 'L' : 'M'} ${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(' ');
  const area = `${path} L ${points[points.length - 1].x.toFixed(1)},${(height - paddingBottom).toFixed(1)} L ${points[0].x.toFixed(1)},${(height - paddingBottom).toFixed(1)} Z`;
  const color = marketProjectionColor(item);
  const first = points[0];
  const last = points[points.length - 1];
  const gradientId = `marketArea${index}`;
  return `<svg class="market-mini-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(item.name)} 未来 7 天规则外推走势">
    <defs><linearGradient id="${gradientId}" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${color}" stop-opacity=".16"/><stop offset="100%" stop-color="${color}" stop-opacity=".01"/></linearGradient></defs>
    <line x1="${paddingX}" y1="${first.y.toFixed(1)}" x2="${width - paddingX}" y2="${first.y.toFixed(1)}" stroke="#D8D4CC" stroke-width="1" stroke-dasharray="3 4" opacity=".72"/>
    <path d="${area}" fill="url(#${gradientId})" stroke="none"/>
    <path d="${path}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" stroke-dasharray="5 4"/>
    <circle cx="${first.x.toFixed(1)}" cy="${first.y.toFixed(1)}" r="3.2" fill="${color}"/>
    <circle cx="${last.x.toFixed(1)}" cy="${last.y.toFixed(1)}" r="2.7" fill="#FFFFFF" stroke="${color}" stroke-width="1.8"/>
    <text x="${paddingX}" y="${Math.max(10, first.y - 7).toFixed(1)}" font-size="9" fill="${color}" font-weight="600">${num(first.value, digits)}</text>
    <text x="${width - paddingX}" y="${Math.max(10, last.y - 7).toFixed(1)}" text-anchor="end" font-size="9" fill="${color}" font-weight="600">${num(last.value, digits)}</text>
    <text x="${paddingX}" y="${height - 2}" font-size="8.5" fill="#8B8580">今日</text>
    <text x="${width - paddingX}" y="${height - 2}" text-anchor="end" font-size="8.5" fill="#8B8580">+6天</text>
  </svg>`;
}

function marketProjectionCardHtml(item, index) {
  const series = marketProjectionSeries(item);
  const direction = marketDirection(item.change_pct);
  const digits = marketPriceDigits(item);
  const values = series.map(point => point.value);
  const min = values.length ? Math.min(...values) : Number(item.price);
  const max = values.length ? Math.max(...values) : Number(item.price);
  const change = normalizeMarketChange(item);
  const trendLabel = change == null ? '方向待补' : change > 0.2 ? '偏强' : change < -0.2 ? '偏弱' : '横盘';
  const unit = item.unit || '';
  return `<article class="market-mini-card ${direction.cls}">
    <div class="market-mini-head"><strong>${esc(item.name)}</strong><span class="market-change-pill ${direction.cls}">${marketChangeText(item.change_pct)}</span></div>
    <div class="market-mini-price"><strong>${num(item.price, digits)}</strong><span>${esc(unit)}</span></div>
    <div class="market-mini-chart">${marketProjectionSvg(item, index)}</div>
    <div class="market-mini-foot"><span>规则外推区间 <b>${num(min, digits)}–${num(max, digits)} ${esc(unit)}</b></span><em class="${direction.cls}">${trendLabel}</em></div>
  </article>`;
}

function marketWatchItemHtml(item) {
  const direction = marketDirection(item.change_pct);
  const digits = marketPriceDigits(item);
  return `<div class="market-watch-item"><div><strong>${esc(item.name)}</strong><span>${esc(item.category || '未分类')}</span></div><div><b>${num(item.price, digits)}</b><em class="${direction.cls}">${marketChangeText(item.change_pct)}</em></div></div>`;
}
function marketImpactChainHtml(signals, actionText) {
  const focus = signals.slice(0, 2);
  if (!focus.length) return '<div class="market-impact-section"><div class="market-impact-head"><div><span class="eyebrow">Price impact chain</span><h4>原料影响链</h4></div><span class="panel-note">暂未匹配内部物料</span></div><div class="cross-empty">当前行情没有形成可核实的外部→内部影响链。</div></div>';
  const rows = focus.map((signal, index) => {
    const names = signal.materials.slice(0, 3).map(item => item.description || item.material).join(' / ');
    const coverage = signal.coverageMin == null ? '—' : `${num(signal.coverageMin, 1)} 天`;
    return `<article class="market-impact-row ${signal.tone}">
      <div class="market-impact-row-head"><span class="market-impact-index">${String(index + 1).padStart(2, '0')}</span><div class="market-impact-name"><strong>${esc(signal.label)}</strong><span>${esc(signal.item.name)} · ${esc(signal.item.category || '未分类')}</span></div><span class="market-direction ${signal.direction.cls}">${marketChangeText(signal.item.change_pct)}</span></div>
      <div class="market-impact-flow"><div><span>关联物料</span><strong>${signal.materials.length} 项</strong></div><i>→</i><div><span>严重 / 优先</span><strong>${signal.criticalCount} / ${signal.priorityCount}</strong></div><i>→</i><div><span>最低覆盖</span><strong>${coverage}</strong></div></div>
      <p><span>样例：</span>${esc(names || '暂无物料名称')}</p>
    </article>`;
  }).join('');
  return `<div class="market-impact-section">
    <div class="market-impact-head"><div><span class="eyebrow">Price impact chain</span><h4>原料影响链</h4></div><span class="panel-note">外部价格 → 内部供应</span></div>
    <div class="market-impact-list">${rows}</div>
    <div class="market-impact-action"><span>今日采购关注</span><strong>${esc(actionText)}</strong></div>
  </div>`;
}

function marketJudgmentCardHtml(signal, index) {
  const names = signal.materials.slice(0, 3).map(item => item.description || item.material).join(' / ');
  const coverage = signal.coverageMin == null ? '—' : `${num(signal.coverageMin, 1)} 天`;
  return `<article class="intel-judgment-card ${signal.tone}">
    <div class="intel-judgment-head"><span class="intel-judgment-index">${String(index + 1).padStart(2, '0')}</span><div><h4>${esc(signal.label)}</h4><p>${esc(signal.item.name)} · ${esc(signal.item.category || '未分类')}</p></div><span class="market-direction ${signal.direction.cls}">${signal.direction.label} ${marketChangeText(signal.item.change_pct)}</span></div>
    <div class="intel-judgment-metrics">
      <div><span>外部行情</span><strong>${marketPriceText(signal.item)}</strong></div>
      <div><span>关联物料</span><strong>${signal.materials.length} 项</strong></div>
      <div><span>内部风险</span><strong>严重 ${signal.criticalCount} · 优先 ${signal.priorityCount}</strong></div>
    </div>
    <div class="intel-judgment-decision"><span>判断</span><strong>${esc(signal.action)}</strong><p>${esc(signal.conclusion)}</p></div>
    <details class="intel-judgment-details"><summary>查看判断依据</summary><p>样例物料：${esc(names || '暂无')}；最低库存覆盖：${coverage}。</p></details>
  </article>`;
}
function renderIntelligence() {
  const d = state.data;
  const market = d.supply.external_market;
  const marketItems = Array.isArray(market.items) ? market.items : [];
  const cross = buildMarketCrossSignals(marketItems);
  const externalUpRisk = cross.signals.filter(signal => signal.criticalCount > 0 && signal.change !== null && signal.change > 0.2);
  const externalDownGroups = cross.signals.filter(signal => signal.change !== null && signal.change < -0.2);
  const leftActionText = externalUpRisk.length
    ? '先锁关键上行链，再处理回落链'
    : externalDownGroups.length
      ? '回落链按计划采购，严重档先保供'
      : '内部补货优先，外部行情保持观察';
  $('#marketStatus').textContent = market.available ? 'WorkBuddy 已接入' : '等待 WorkBuddy 接入';
  $('#marketStatus').className = 'status-pill ' + (market.available ? 'live' : 'subtle');

  if (market.available && marketItems.length) {
    const items = marketShowcaseItems(marketItems, 10);
    const featured = marketFeaturedItems(marketItems);
    const featuredNames = new Set(featured.map(item => item.name));
    const watchItems = items.filter(item => !featuredNames.has(item.name));
    const watchFocus = watchItems.slice().sort((a, b) => Math.abs(normalizeMarketChange(b) ?? 0) - Math.abs(normalizeMarketChange(a) ?? 0)).slice(0, 4);
    $('#marketPanel').innerHTML = `
      <div class="panel-head"><div><span class="eyebrow">External market</span><h3>核心原料 7 天走势</h3></div><div class="market-panel-meta"><span class="market-panel-tag">参考信息</span><span class="panel-note">${items.length} 品种 · 涨 ${cross.stats.risingCount} / 落 ${cross.stats.fallingCount} · ${esc(market.updated_at || '日期待同步')}</span></div></div>
      <div class="market-feature-grid">${featured.map((item, index) => marketProjectionCardHtml(item, index)).join('')}</div>
      ${watchFocus.length ? `<div class="market-watchlist"><div class="market-watch-head"><span>其他关注</span><span>按波动幅度选取</span></div><div class="market-watch-grid">${watchFocus.map(marketWatchItemHtml).join('')}</div></div>` : ''}
      ${marketImpactChainHtml(cross.signals, leftActionText)}
      <p class="side-note market-method-note"><strong>说明：</strong>圆点为今日价，虚线为规则外推；用于观察方向，不构成预测或采购承诺。</p>
      <p class="side-note">来源：WorkBuddy · external_market.json</p>
    `;
  } else {
    $('#marketPanel').innerHTML = `
      <div class="panel-head"><div><span class="eyebrow">External market</span><h3>行情尚未接入</h3></div><span class="badge amber">等待数据</span></div>
      <div class="empty-state" style="padding:42px 20px">
        <strong>等待 WorkBuddy 写入 external_market.json</strong>
        行情板块目前为空，但页面内部供应信号仍可正常使用。<br>
        支持结构：行情条目 / 涨跌幅 / 来源 / 日期 / 情报标题。
      </div>
    `;
  }

  const counts = tierCounts(d.supply.materials);
  const topSupplier = [...d.supply.suppliers.items].sort((a, b) => (a.delivery_health_score ?? 0) - (b.delivery_health_score ?? 0))[0];
  const stats = cross.stats;
  const crossTop = cross.signals.slice(0, 2);
  const topExternal = marketItems
    .filter(item => normalizeMarketChange(item) !== null)
    .slice()
    .sort((a, b) => Math.abs(normalizeMarketChange(b)) - Math.abs(normalizeMarketChange(a)))
    .slice(0, 3);
  const externalHeadline = market.available
    ? `WorkBuddy 已接入 ${stats.itemCount} 项行情，其中 ${stats.changedCount} 项有有效涨跌：上涨 ${stats.risingCount}、回落 ${stats.fallingCount}，平均 ${stats.avgChange == null ? '—' : stats.avgChange.toFixed(2) + '%'}。`
    : '外部行情尚未接入，当前只使用内部供应、PO 和 MB51 信号，不对价格作结论。';
  const externalFocus = topExternal.length
    ? topExternal.map(item => `${item.name} ${marketChangeText(item.change_pct)}`).join('；')
    : '暂无可比较的外部行情';
  const priorityLabels = crossTop.filter(signal => signal.tone === 'critical').map(signal => signal.label).slice(0, 2);
  const decisionHeadline = !market.available
    ? '外部行情未接入，当前只按内部供应做判断。'
    : externalUpRisk.length
      ? `成本上行叠加内部缺口，先处理${priorityLabels.length ? ' ' + priorityLabels.join('、') : '关键上行链'}。`
      : externalDownGroups.length
        ? '外部成本压力缓和，但内部断料仍是主矛盾。'
        : '外部行情暂稳，优先处理内部严重与预警物料。';
  const decisionTone = externalUpRisk.length ? 'critical' : externalDownGroups.length ? 'watch' : 'calm';
  let combinedAdvice = '优先处理内部严重档和优先档，再按补货建议执行。';
  if (!market.available) {
    combinedAdvice = `先处理严重档 ${counts.t1} 项和优先档 ${counts.t2 + counts.t3} 项；外部未接入，不作价格判断。`;
  } else if (externalUpRisk.length) {
    combinedAdvice = `外部上行叠加内部高风险，先锁定${externalUpRisk.map(signal => signal.label).join('、')}的价格和交期。`;
  } else if (externalDownGroups.length) {
    combinedAdvice = `外部成本压力缓和，${externalDownGroups.map(signal => signal.label).join('、')}可按计划采购、择机锁价；严重缺口仍先保供。`;
  } else if (stats.matchedMaterials) {
    combinedAdvice = `外部未形成明显成本压力，优先处理严重档 ${counts.t1} 项和优先档 ${counts.t2 + counts.t3} 项。`;
  }
  const crossTopHtml = crossTop.length
    ? crossTop.map((signal, index) => marketJudgmentCardHtml(signal, index)).join('')
    : '<div class="cross-empty">当前行情未能匹配到内部产品组，暂不生成外部结论。</div>';
  const internalEvidence = `${d.supply.materials.length} 项物料：严重 ${counts.t1} / 预警 ${counts.t2} / 临期 ${counts.t3} / 正常 ${counts.t4}；${d.supply.purchase_orders.summary.overdue} 张 PO 逾期，${d.data_quality.derived.missing_mb51_receipts ?? 0} 条缺 MB51 收货记录。`;
  const supplierEvidence = topSupplier
    ? `${topSupplier.name} 当前交付健康分最低，准时率 ${pct(topSupplier.on_time_rate)}，缺收货 ${topSupplier.missing_receipts} 单。`
    : '暂无供应商数据。';
  const externalEvidence = `${externalHeadline}${market.available ? `重点波动：${externalFocus}。` : ''}`;
  const matchEvidence = `已匹配 ${stats.matchedMaterials} 项内部物料、${stats.matchedGroups} 条供应相关外部行情；未匹配物料不参与外部结论。`;
  $('#intelSummary').innerHTML = `
    <div class="panel-head"><div><span class="eyebrow">Internal + market signals</span><h3>内外结合判断</h3></div><span class="badge blue">规则交叉</span></div>
    <div class="intel-decision-summary ${decisionTone}">
      <div class="intel-decision-kicker"><span>判断结论</span><em>${market.available ? '外部参考 · 内部主导' : '仅内部数据'}</em></div>
      <h4>${esc(decisionHeadline)}</h4>
      <p>${esc(combinedAdvice)}</p>
    </div>
    <div class="intel-focus-strip">
      <div><span>严重物料</span><strong class="risk">${counts.t1}</strong><em>优先处理</em></div>
      <div><span>外部关联</span><strong>${stats.matchedMaterials}</strong><em>已映射物料</em></div>
      <div><span>上行风险</span><strong class="${externalUpRisk.length ? 'risk' : 'neutral'}">${externalUpRisk.length}</strong><em>内外叠加</em></div>
    </div>
    <div class="intel-judgment-list">${crossTopHtml}</div>
    <details class="intel-evidence-fold">
      <summary><span>查看完整判断依据</span><em>内部供应 · 供应商 · 外部匹配</em></summary>
      <div class="intel-evidence-list">
        <div><span>内部供应</span><p>${esc(internalEvidence)}</p></div>
        <div><span>供应商</span><p>${esc(supplierEvidence)}</p></div>
        <div><span>外部行情</span><p>${esc(externalEvidence)}</p></div>
        <div><span>规则匹配</span><p>${esc(matchEvidence)}</p></div>
      </div>
      <div class="prov-row"><b>依据</b>供应风险表 ${d.supply.materials.length} 行 + PO 台账 ${d.supply.purchase_orders.items.length} 张 + MB51 收货记录<span class="prov-sep"></span><span class="prov-tag">外部行情：${market.available ? '已接入 ' + stats.itemCount + ' 项' : '未接入'}</span><span class="prov-sep"></span><span>置信度 中 · 生成于 ${esc(d.meta.generated_at || d.meta.as_of || '')}</span></div>
    </details>
  `;  if (market.available && marketItems.length) {
    const newsItems = marketItems
      .filter(item => item.summary || item.source || item.url)
      .slice()
      .sort((a, b) => Math.abs(Number(b.change_pct) || 0) - Math.abs(Number(a.change_pct) || 0))
      .slice(0, 8);
    const newsHtml = newsItems.map(item => {
      const direction = marketDirection(item.change_pct);
      const url = safeMarketUrl(item.url);
      return `<article class="news-item">
        <div class="news-item-head"><strong>${esc(item.name)}</strong><span class="market-direction ${direction.cls}">${direction.label}</span></div>
        <p>${esc(item.summary || 'WorkBuddy 已获取该品种行情，暂未提供摘要。')}</p>
        <div class="news-meta"><span>${esc(item.category || '未分类')} · ${esc(item.source || '来源待补')} · ${esc(item.date || '')}</span>${url ? `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">原文 ↗</a>` : ''}</div>
      </article>`;
    }).join('');
    $('#newsPanel').innerHTML = `
      <div class="panel-head"><div><span class="eyebrow">Intelligence feed</span><h3>行业情报 · 公开资讯</h3></div><span class="panel-note">${newsItems.length} / ${marketItems.length} 条 · WorkBuddy 每日更新</span></div>
      <p class="side-note news-source-note">当前 WorkBuddy 提供的是原料行情与公开资讯摘要，暂未提供供应商个体新闻。以下按涨跌幅度展示重点条目。</p>
      <div class="news-grid">${newsHtml}</div>
    `;
  } else {
    $('#newsPanel').innerHTML = `
      <div class="panel-head"><div><span class="eyebrow">Intelligence feed</span><h3>行业情报</h3></div><span class="panel-note">由 WorkBuddy 每日更新</span></div>
      <div class="empty-state">当前没有可展示的情报条目。WorkBuddy 接入后可在这里显示行情摘要、来源和原文链接。</div>
    `;
  }
}

function renderMethod() {
  const d = state.data;
  const p = d.provenance;
  const formulas = (p.formulas || []).map(f => `<p><strong>${esc(f.field)}：</strong>${esc(f.formula)}<br>${esc(f.note || '')}</p>`).join('');
  const limitations = (p.limitations || []).map(x => `<li>${esc(x)}</li>`).join('');
  const sources = Object.entries(p.sources || {}).map(([key, value]) => `<li>${esc(key)} → ${esc(value)}</li>`).join('');
  $('#methodBody').innerHTML = `
    <h4>数据来源</h4><ul>${sources}</ul>
    <h4>计算口径</h4>${formulas}
    <h4>边界说明</h4><ul>${limitations}</ul>
  `;
}

function openMethod() {
  $('#methodTitle').textContent = '口径与方法';
  renderMethod();
  $('#methodModal').hidden = false;
  setTimeout(() => $('#methodClose')?.focus(), 20);
}

function closeMethod() {
  $('#methodModal').hidden = true;
}

function openSupplierMethod() {
  $('#methodTitle').textContent = '供应商画像口径';
  $('#methodBody').innerHTML = `
    <h4>交付健康分</h4>
    <p>交付健康分是页面为了排序供应商而计算的派生指标，不是供应商质量认证分数。</p>
    <p>计算逻辑：从 100 分起，按准时率、缺收货比例、中位延迟、分批到货率和小样本订单进行扣分，最终限制在 0–100。</p>
    <h4>卡片字段</h4>
    <ul>
      <li>履约能力：准时率 + 中位首到延迟。</li>
      <li>供应品类：关联物料的产品组，取出现次数最多的品类。</li>
      <li>合作规模：累计订单数 + 分批到货率。</li>
      <li>交付周期：中位采购周期 + P90 延迟。</li>
      <li>缺收货：MB51 缺收货订单数，不直接判定供应商责任。</li>
    </ul>
    <h4>未使用字段</h4>
    <p>质量合格率、合作年限、响应小时数、产能状态当前数据没有，不进行模拟。</p>
  `;
  openMethod();
}

function openDrawer(title, eyebrow, bodyHtml) {
  state.lastFocus = document.activeElement;
  $('#drawerTitle').textContent = title;
  $('#drawerEyebrow').textContent = eyebrow;
  $('#drawerBody').innerHTML = bodyHtml;
  $('#drawerMask').hidden = false;
  $('#drawer').classList.add('open');
  $('#drawer').setAttribute('aria-hidden', 'false');
  setTimeout(() => $('#drawerClose')?.focus(), 20);
}

function closeDrawer() {
  const drawer = $('#drawer');
  if (!drawer?.classList.contains('open')) return;
  drawer.classList.remove('open');
  drawer.setAttribute('aria-hidden', 'true');
  $('#drawerMask').hidden = true;
  state.lastFocus?.focus?.();
}

function openAction(action) {
  const d = state.data;
  const formula = `动态库存天数 = (当前可用库存 + 在途库存) / 平均日销量
= (${num(action.available, 2)} + ${num(action.incoming, 2)}) / ${num(action.avg_daily, 4)}
= ${action.dynamic_inventory_days == null ? '不计算' : action.dynamic_inventory_days.toFixed(2) + ' 天'}

缓冲量 = max(0, P95日销量 × P95到货天数 − 平均日销量 × 平均到货天数)
= ${num(action.buffer_qty, 2)} kg

安全库存 = 缓冲量 = ${num(action.safety_stock, 2)} kg
再订货点 = 平均日销量 × 平均到货天数 + 缓冲量 = ${num(action.reorder_point, 2)} kg
建议补货量 = max(0, ceil(再订货点 − 当前可用库存 − 在途库存))
= ${num(action.suggested_replenishment, 0)} kg`;
  const review = action.review_reasons?.length ? action.review_reasons.map(reasonText).map(x => `<span class="detail-tag">${esc(x)}</span>`).join('') : '<span class="detail-tag">无复核提示</span>';
  openDrawer(action.material + ' · ' + action.plant, '采购建议证据', `
    <section class="drawer-section"><h4>结论</h4><div class="detail-grid">
      <div class="detail-cell"><span>新建议补货</span><strong>${num(action.suggested_replenishment, 0)} kg</strong></div>
      <div class="detail-cell"><span>旧建议补单</span><strong>${num(action.old_order_qty, 0)} kg</strong></div>
      <div class="detail-cell"><span>差异率</span><strong>${action.replenishment_delta_pct == null ? '—' : action.replenishment_delta_pct.toFixed(1) + '%'}</strong></div>
      <div class="detail-cell"><span>建议下单日</span><strong>${action.must_order_by || '待排期'}</strong></div>
      <div class="detail-cell"><span>置信度</span><strong>${esc(action.confidence || '—')}</strong></div>
      <div class="detail-cell"><span>到货天数来源</span><strong>${esc(action.lead_source || '—')}</strong></div>
    </div></section>
    <section class="drawer-section"><h4>公式与数值</h4><div class="formula-box">${formula}</div></section>
    <section class="drawer-section"><h4>样本与证据</h4><div class="detail-grid">
      <div class="detail-cell"><span>日销量样本</span><strong>${action.demand_samples ?? 0}</strong></div>
      <div class="detail-cell"><span>到货样本</span><strong>${action.lead_samples ?? 0}</strong></div>
      <div class="detail-cell"><span>平均日销量</span><strong>${num(action.avg_daily, 4)} kg</strong></div>
      <div class="detail-cell"><span>P95日销量</span><strong>${num(action.p95_daily, 4)} kg</strong></div>
      <div class="detail-cell"><span>ATP承诺量</span><strong>${num(action.atp_commit_qty, 2)} kg</strong></div>
      <div class="detail-cell"><span>参考补货(含逾期)</span><strong>${num(action.reference_replenishment_with_overdue, 0)} kg</strong></div>
    </div></section>
    <section class="drawer-section"><h4>复核提示</h4><div>${review}</div><p class="detail-note" style="margin-top:8px">${esc(action.review_note || '当前没有额外复核提示。')}</p></section>
    <section class="drawer-section"><h4>来源</h4><p class="detail-note">${esc(d.provenance.input_file)} · 供应风险总表 / 采购断料行动清单。建议补货量在 Python 生成器中重算，前端不重复计算。</p></section>
  `);
}

function openMaterial(material) {
  const action = state.data.supply.actions.find(a => a.key === material.key);
  if (action) return openAction(action);
  openDrawer(material.material + ' · ' + material.plant, '物料快照', `
    <section class="drawer-section"><h4>核心指标</h4><div class="detail-grid">
      <div class="detail-cell"><span>风险</span><strong>${riskText(material.risk_level)}</strong></div>
      <div class="detail-cell"><span>交付健康分</span><strong>${material.health_index ?? '—'}</strong></div>
      <div class="detail-cell"><span>可用库存</span><strong>${num(material.available, 2)} kg</strong></div>
      <div class="detail-cell"><span>动态库存天数</span><strong>${material.dynamic_inventory_days == null ? '—' : material.dynamic_inventory_days.toFixed(2) + '天'}</strong></div>
      <div class="detail-cell"><span>ATP承诺量</span><strong>${num(material.atp_commit_qty, 2)} kg</strong></div>
      <div class="detail-cell"><span>安全库存</span><strong>${num(material.safety_stock, 2)} kg</strong></div>
    </div></section>
    <section class="drawer-section"><h4>风险原因</h4><p class="detail-note">${esc(material.risk_reason || '—')}</p></section>
    <section class="drawer-section"><h4>数据来源</h4><p class="detail-note">${esc(state.data.provenance.input_file)} · ${esc(material.supplier || '未指定供应商')}</p></section>
  `);
}

function openPO(po) {
  const tier = poTier(po);
  const eta = etaRange(po);
  const cause = poCause(po);
  const s = supplierStat(po.supplier);
  const dl = po.days_left;
  const isStale = dl != null && dl < -30;
  const fact = `${po.po_no} · ${po.description || po.material} · 承诺到货 ${dateText(po.eta_date)} · 当前状态「${PO_TIER_NAME[tier]}」`;
  const why = isStale
    ? `该订单已逾期 ${Math.abs(dl)} 天，但供应商历史 P90 延误仅 ${s ? s.p90_delay : '—'} 天。大概率是台账未清账/未关闭，不是真实交期问题，建议先核对 SRM 与收货记录。`
    : `${cause.text}。供应商近 ${s ? (s.arrived_orders ?? 0) : 0} 单准点率 ${s ? s.on_time_rate : '—'}%，缺收货 ${s ? s.missing_receipts : '—'} 单。`;
  openDrawer(po.po_no, '采购订单明细', `
    <section class="drawer-section">
      <h4>判断</h4>
      <div style="padding-left:10px;border-left:2px solid ${isStale ? '#d97706' : tier === 't1' ? 'var(--t1)' : 'var(--brand-600)'}">
        <div class="alert-fact">${esc(fact)}</div>
        <div class="alert-why">${esc(why)}</div>
        <div class="alert-act">
          ${isStale
            ? `<button class="btn small" onclick="showToast('已加入核对清单')">加入核对清单</button><button class="link" onclick="showToast('已跳转 SRM')">查 SRM 单号</button>`
            : `<button class="btn small primary" onclick="showToast('催办已记录 · ' + new Date().toLocaleTimeString('zh-CN',{hour12:false}))">记录催办</button><button class="btn small" onclick="showToast('已生成备选供应商比价')">切换备选</button><button class="link" onclick="showToast('已标记改空运评估')">评估空运</button>`}
        </div>
      </div>
    </section>
    <section class="drawer-section"><h4>订单</h4><div class="detail-grid">
      <div class="detail-cell"><span>物料</span><strong>${esc(po.material || '—')}</strong></div>
      <div class="detail-cell"><span>描述</span><strong>${esc(po.description || '—')}</strong></div>
      <div class="detail-cell"><span>供应商</span><strong>${esc(po.supplier || '—')}</strong></div>
      <div class="detail-cell"><span>工厂</span><strong>${esc(po.plant || '—')}</strong></div>
      <div class="detail-cell"><span>预计到货</span><strong>${dateText(po.eta_date)} <span class="eta-range ${eta.wide ? 'wide' : ''}" title="${esc(eta.tip)}">${eta.text}</span></strong></div>
      <div class="detail-cell"><span>剩余天数</span><strong>${po.days_left ?? '—'}</strong></div>
      <div class="detail-cell"><span>订单数量</span><strong>${num(po.order_qty, 2)} kg</strong></div>
      <div class="detail-cell"><span>未交数量</span><strong>${num(po.open_qty, 2)} kg</strong></div>
    </div></section>
    <section class="drawer-section"><h4>风险匹配</h4><p class="detail-note">${po.matched_risk ? '该 PO 已匹配供应风险总表，风险等级：' + riskText(po.risk_level) : '该 PO 未匹配到供应风险总表，页面保留原始 PO 数据，但不将其并入风险物料行动清单。'}</p></section>
    <div class="prov-row"><b>依据</b>PO 台账 ${esc(po.order_date || '')} 下单 · 供应商 ${esc(po.supplier || '')} 近 12 个月交货统计<span class="prov-sep"></span><span>±Nd 为 P80 延误，非承诺保证</span></div>
  `);
}

function openSupplier(supplier) {
  const materials = state.data.supply.materials.filter(m => m.supplier === supplier.name);
  const groups = (supplier.product_groups || []).map(g => `<span class="detail-tag">${esc(g.name)} · ${g.count}</span>`).join('') || '<span class="detail-tag">未分组</span>';
  const related = materials.slice(0, 8).map(m => `<div class="side-list-row"><span>${esc(m.material)} · ${esc(m.plant)}</span><strong>${riskText(m.risk_level)}</strong></div>`).join('') || '<p class="detail-note">暂无关联物料</p>';
  openDrawer(supplier.name, '供应商画像', `
    <section class="drawer-section"><h4>交付健康分</h4><div class="detail-grid">
      <div class="detail-cell"><span>交付健康分</span><strong>${(supplier.delivery_health_score ?? 0).toFixed(1)} / 100</strong></div>
      <div class="detail-cell"><span>风险标签</span><strong>${esc(supplier.risk_label)}</strong></div>
      <div class="detail-cell"><span>准时率</span><strong>${pct(supplier.on_time_rate)}</strong></div>
      <div class="detail-cell"><span>中位延迟</span><strong>${supplier.median_delay ?? '—'} 天</strong></div>
      <div class="detail-cell"><span>P90延迟</span><strong>${supplier.p90_delay ?? '—'} 天</strong></div>
      <div class="detail-cell"><span>中位采购周期</span><strong>${supplier.median_lead ?? '—'} 天</strong></div>
      <div class="detail-cell"><span>累计订单</span><strong>${supplier.orders}</strong></div>
      <div class="detail-cell"><span>缺收货</span><strong>${supplier.missing_receipts}</strong></div>
    </div></section>
    <section class="drawer-section"><h4>供应品类</h4><div>${groups}</div></section>
    <section class="drawer-section"><h4>关联物料</h4><div class="side-list">${related}</div></section>
    <section class="drawer-section"><h4>口径</h4><p class="detail-note">交付健康分由准时率、延迟、缺收货与分批到货比例派生；质量和产能字段当前没有数据，不使用模拟值。</p></section>
  `);
}

function reasonText(reason) {
  return { low_confidence: '低置信度', delta_gt_50: '差异超过50%', new_recommendation: '新增补货建议', no_demand: '无消耗数据', overdue: '逾期', other: '其他复核' }[reason] || reason;
}

function initRobot() {
  if (state.robotReady) return;
  state.robotReady = true;
  const panel = $('#robotPanel');
  $('#robotLauncher').addEventListener('click', () => {
    const open = panel.classList.toggle('open');
    panel.setAttribute('aria-hidden', String(!open));
    if (open) setTimeout(() => $('#robotInput')?.focus(), 50);
  });
  $('#robotClose').addEventListener('click', closeRobot);
  $('#robotForm').addEventListener('submit', event => {
    event.preventDefault();
    const input = $('#robotInput');
    const question = input.value.trim();
    if (!question) return;
    input.value = '';
    addRobotMessage(question, 'user');
    const answer = answerQuestion(question);
    setTimeout(() => addRobotMessage(answer.text, 'bot', answer.source), 160);
  });
  const suggestions = ['今天最紧急的物料', '哪些 PO 已逾期', '哪些供应商需要关注', 'ATP 为 0 的物料'];
  $('#robotSuggestions').innerHTML = suggestions.map(text => `<button class="suggestion" type="button">${esc(text)}</button>`).join('');
  $$('#robotSuggestions .suggestion').forEach(button => button.addEventListener('click', () => {
    $('#robotInput').value = button.textContent;
    $('#robotForm').requestSubmit();
  }));
  addRobotMessage('你好，我是供应雷达助手。可以问我紧急物料、逾期 PO、ATP、供应商、库龄或某条建议的计算依据。', 'bot', '本地数据问答');
  const params = new URLSearchParams(location.search);
  if (params.get('robot') === '1') setTimeout(() => $('#robotLauncher').click(), 300);
  if (params.get('ask')) setTimeout(() => {
    $('#robotInput').value = params.get('ask');
    $('#robotForm').requestSubmit();
  }, 700);
}

function closeRobot() {
  $('#robotPanel').classList.remove('open');
  $('#robotPanel').setAttribute('aria-hidden', 'true');
}

function addRobotMessage(text, type, source = '') {
  const message = document.createElement('div');
  message.className = 'msg ' + type;
  message.textContent = text;
  if (source) {
    const meta = document.createElement('small');
    meta.textContent = source;
    message.appendChild(meta);
  }
  $('#robotMessages').appendChild(message);
  $('#robotMessages').scrollTop = $('#robotMessages').scrollHeight;
}

function answerQuestion(question) {
  const d = state.data;
  const q = question.toLowerCase();
  const materialMatch = question.match(/\b\d{6,}\b/);
  if (materialMatch && (q.includes('为什么') || q.includes('建议') || q.includes('补货') || q.includes('计算'))) {
    const code = materialMatch[0];
    const action = d.supply.actions.find(a => a.material === code) || d.supply.materials.find(m => m.material === code);
    if (action) {
      if (action.old_order_qty !== undefined) return { text: `${code} 当前可用 ${num(action.available,2)} kg，在途 ${num(action.incoming,2)} kg，安全库存 ${num(action.safety_stock,2)} kg，再订货点 ${num(action.reorder_point,2)} kg。因此新建议补货 ${num(action.suggested_replenishment,0)} kg，旧建议 ${num(action.old_order_qty,0)} kg，置信度 ${action.confidence}。`, source: '采购断料行动清单 / 公式重算' };
      return { text: `${code} 当前风险为 ${riskText(action.risk_level)}，可用库存 ${num(action.available,2)} kg，动态库存天数 ${action.dynamic_inventory_days == null ? '无消耗数据' : action.dynamic_inventory_days.toFixed(2) + ' 天'}。`, source: '供应风险总表' };
    }
  }
  if (q.includes('紧急')) {
    const all = d.supply.materials.filter(m => m.risk_level.includes('紧急'));
    const rows = all.slice(0, 6);
    return { text: '当前紧急物料共 ' + all.length + ' 项。优先关注：\n' + rows.map(m => '· ' + m.material + ' · ' + m.plant + '，动态库存 ' + (m.dynamic_inventory_days == null ? '—' : m.dynamic_inventory_days.toFixed(1) + ' 天')).join('\n'), source: 'overview / supply.materials' };
  }
  if (q.includes('逾期') || q.includes('催货')) {
    const po = d.supply.purchase_orders.summary;
    const top = d.supply.purchase_orders.items.filter(x => x.decision_bucket === 'overdue').slice(0, 5);
    return { text: `当前有 ${po.overdue} 张逾期 PO、${po.due_2d} 张 2 天内到货 PO。优先催办：\n${top.map(x => '· ' + x.po_no + ' · ' + x.supplier + ' · 剩余 ' + x.days_left + ' 天').join('\n')}`, source: 'PO到货计划' };
  }
  if (q.includes('供应商')) {
    const rows = [...d.supply.suppliers.items].sort((a, b) => (a.delivery_health_score ?? 0) - (b.delivery_health_score ?? 0)).slice(0, 5);
    return { text: '当前供应商共 ' + d.supply.suppliers.total + ' 家。交付健康分最低的是：\n' + rows.map(s => '· ' + s.name + '：' + s.delivery_health_score.toFixed(1) + ' 分，准时率 ' + pct(s.on_time_rate) + '，缺收货 ' + s.missing_receipts + ' 单').join('\n'), source: 'MB51实际收货 / 供应商画像' };
  }
  if (q.includes('复核') || q.includes('低置信')) {
    const rows = d.supply.actions.filter(a => a.needs_review);
    return { text: '当前有 ' + rows.length + ' 项待复核。主要原因是低置信度、差异超过 50% 或缺建议下单日。可在采购执行视图筛选“待复核”。', source: '采购断料行动清单' };
  }
  if (q.includes('atp') || q.includes('承诺')) {
    const materials = d.supply.materials;
    const total = materials.reduce((sum, m) => sum + (m.atp_commit_qty || 0), 0);
    const zero = materials.filter(m => (m.atp_commit_qty || 0) <= 0).length;
    return { text: '当前供应侧 ATP 合计约 ' + compact(total, 1) + ' kg，ATP 为 0 的物料有 ' + zero + ' 项。ATP = 可用库存 + 在途 - 安全库存。', source: 'ATP派生字段' };
  }
  if (q.includes('库龄') || q.includes('仓储')) {
    const w = d.warehouse;
    return { text: '当前仓储共 ' + w.summary.batch_rows + ' 个批次，库存金额 ' + money(w.summary.inventory_amount) + '，可用库存 ' + compact(w.summary.available_qty, 1) + ' kg，最老库龄 ' + w.summary.oldest_age_days + ' 天。', source: '库存明细' };
  }
  if (q.includes('缺收货')) {
    return { text: '工厂 1501 有 ' + (d.data_quality.derived.missing_mb51_receipts ?? 0) + ' 条 MB51 缺收货记录。缺收货会影响供应商准时率的解释，不能直接等同于供应商责任。', source: 'MB51实际收货 / 数据质量' };
  }
  if (q.includes('健康') || q.includes('分档') || q.includes('风险分布')) {
    const counts = tierCounts(d.supply.materials);
    const total = d.supply.materials.length;
    return {
      text: '按理论可用天数分五档（共 ' + total + ' 项物料）：\n'
        + '· 严重（紧急且可用≤3天）：' + counts.t1 + ' 项\n'
        + '· 预警（紧急但可用>3天）：' + counts.t2 + ' 项\n'
        + '· 临期（关注档）：' + counts.t3 + ' 项\n'
        + '· 正常：' + counts.t4 + ' 项\n'
        + '· 未跟踪（无消耗/缺覆盖天数）：' + counts.t5 + ' 项\n'
        + '先处理严重档的 ' + counts.t1 + ' 项，再看预警档。',
      source: '供应风险表 · 按 coverage_days 分档'
    };
  }
  return { text: '当前监控 ' + d.supply.materials.length + ' 个物料/工厂组合，' + d.supply.actions.length + ' 条补单建议。可以继续问我“紧急物料”“逾期 PO”“供应商”“ATP”或直接输入物料编码。', source: '本地数据摘要' };
}

function tierDef(key) {
  return TIER_DEFS.find(x => x.key === key) || TIER_DEFS[4];
}

function renderTodayFocus() {
  const d = state.data;
  const counts = tierCounts(d.supply.materials);
  const focusActions = d.supply.actions.filter(a => ['overdue', 'due_today', 'due_7d'].includes(a.decision_bucket));
  const rows = focusActions.slice(0, 8);
  $('#focusSummary').innerHTML = `
    <div class="task-kpis">
      <div class="task-kpi"><span>严重档物料</span><strong>${counts.t1}</strong></div>
      <div class="task-kpi"><span>已过建议下单日</span><strong>${d.overview.decision_cards.overdue.count}</strong></div>
      <div class="task-kpi"><span>逾期 PO</span><strong>${d.supply.purchase_orders.summary.overdue}</strong></div>
      <div class="task-kpi"><span>缺 MB51 收货</span><strong>${d.data_quality.derived.missing_mb51_receipts ?? 0}</strong></div>
    </div>
  `;
  $('#focusList').innerHTML = `
    <div class="panel-head"><div><span class="eyebrow">Action queue</span><h3>今日行动清单</h3></div><button class="text-btn" data-route-inline="supply/replenishment">全部补货建议</button></div>
    <div class="table-wrap"><table class="data-table"><thead><tr><th>物料</th><th>供应商</th><th>建议下单</th><th class="num">建议补货</th><th>置信度</th><th>状态</th></tr></thead><tbody>
      ${rows.map(a => `<tr data-focus-action="${esc(a.key)}"><td><span class="strong">${esc(a.material)}</span><span class="sub">${esc(a.plant)} · ${esc(a.description)}</span></td><td>${esc(a.supplier)}</td><td>${esc(a.must_order_by || '待排期')}</td><td class="num">${compact(a.suggested_replenishment, 0)} kg</td><td><span class="badge ${a.confidence === '高' ? 'green' : a.confidence === '低' ? 'red' : 'blue'}">${esc(a.confidence)}</span></td><td><span class="badge ${a.decision_bucket === 'overdue' ? 'red' : 'amber'}">${a.decision_bucket === 'overdue' ? '已逾期' : a.decision_bucket === 'due_today' ? '今天' : '7天内'}</span></td></tr>`).join('') || '<tr><td colspan="6"><div class="empty-state">今天没有需要立即处理的补货行动</div></td></tr>'}
    </tbody></table></div>
  `;
  $$('#focusList [data-focus-action]').forEach(row => row.addEventListener('click', () => {
    const action = state.data.supply.actions.find(a => a.key === row.dataset.focusAction);
    if (action) openAction(action);
  }));
  $('#focusList [data-route-inline]')?.addEventListener('click', event => setRoute(event.currentTarget.dataset.routeInline));
}

function renderTodayAlerts() {
  const d = state.data;
  const counts = tierCounts(d.supply.materials);
  $('#alertSummary').innerHTML = `
    <div class="task-kpis">
      <div class="task-kpi"><span>严重档</span><strong style="color:var(--t1)">${counts.t1}</strong></div>
      <div class="task-kpi"><span>预警档</span><strong style="color:var(--t2)">${counts.t2}</strong></div>
      <div class="task-kpi"><span>临期档</span><strong style="color:var(--t3)">${counts.t3}</strong></div>
      <div class="task-kpi"><span>未跟踪档</span><strong>${counts.t5}</strong></div>
    </div>
  `;
  const ordered = [...d.supply.materials].sort((a, b) => {
    const order = { t1: 0, t2: 1, t3: 2, t4: 3, t5: 4 };
    return (order[tierOf(a)] ?? 9) - (order[tierOf(b)] ?? 9) || (a.coverage_days ?? 99999) - (b.coverage_days ?? 99999);
  }).slice(0, 24);
  $('#alertList').innerHTML = `
    <div class="panel-head"><div><span class="eyebrow">Risk queue</span><h3>风险物料明细</h3></div><span class="panel-note">严重档优先</span></div>
    <div class="table-wrap"><table class="data-table"><thead><tr><th>档位</th><th>物料</th><th>供应商</th><th class="num">可用库存</th><th class="num">可用天数</th><th>风险原因</th></tr></thead><tbody>
      ${ordered.map(m => { const td = tierDef(tierOf(m)); return `<tr data-alert-material="${esc(m.key)}"><td><span class="badge ${tierOf(m) === 't1' ? 'red' : tierOf(m) === 't2' ? 'orange' : tierOf(m) === 't3' ? 'amber' : 'gray'}">${td.name}</span></td><td><span class="strong">${esc(m.material)}</span><span class="sub">${esc(m.plant)} · ${esc(m.description)}</span></td><td>${esc(m.supplier || '未指定')}</td><td class="num">${compact(m.available, 0)}</td><td class="num">${m.coverage_days == null ? '—' : m.coverage_days.toFixed(1)}</td><td><span class="sub">${esc(m.risk_reason || '—')}</span></td></tr>`; }).join('')}
    </tbody></table></div>
  `;
  $$('#alertList [data-alert-material]').forEach(row => row.addEventListener('click', () => {
    const material = state.data.supply.materials.find(m => m.key === row.dataset.alertMaterial);
    if (material) openMaterial(material);
  }));
}

function loadAgentTasks() {
  try {
    const raw = JSON.parse(localStorage.getItem('supplyRadarAgentTasks') || '[]');
    return Array.isArray(raw) ? raw : [];
  } catch (_) { return []; }
}

function saveAgentTasks(tasks) {
  localStorage.setItem('supplyRadarAgentTasks', JSON.stringify(tasks));
}

function createAgentTaskFromAction(action, owner = '待指派', dueDate = '') {
  const tasks = loadAgentTasks();
  const existing = tasks.find(t => t.material === action.material && t.plant === action.plant && t.status !== 'done');
  if (existing) {
    showToast('该物料已有未完成任务');
    return existing;
  }
  const task = {
    id: 'TASK-' + Date.now(),
    material: action.material,
    plant: action.plant,
    description: action.description,
    supplier: action.supplier,
    qty: action.suggested_replenishment,
    owner,
    dueDate,
    status: 'pending',
    createdAt: new Date().toISOString(),
    evidence: '安全库存 ${num(action.safety_stock, 2)} kg；再订货点 ${num(action.reorder_point, 2)} kg；建议补货 ${num(action.suggested_replenishment, 0)} kg；置信度 ${action.confidence}'.replace('${num(action.safety_stock, 2)}', num(action.safety_stock, 2)).replace('${num(action.reorder_point, 2)}', num(action.reorder_point, 2)).replace('${num(action.suggested_replenishment, 0)}', num(action.suggested_replenishment, 0)).replace('${action.confidence}', action.confidence || '—'),
  };
  tasks.unshift(task);
  saveAgentTasks(tasks);
  showToast('已创建本地 Agent 任务');
  refreshTaskViews();
  return task;
}

function refreshTaskViews() {
  renderTodayTasks();
  renderAITasks();
  renderAIApproval();
  renderAIReview();
  setViewCounts();
}

function renderTodayTasks() {
  const d = state.data;
  const tasks = loadAgentTasks();
  const actions = d.supply.actions.slice(0, 8);
  $('#todayTaskSummary').innerHTML = `
    <div class="task-kpis">
      <div class="task-kpi"><span>今日补货行动</span><strong>${d.supply.actions.length}</strong></div>
      <div class="task-kpi"><span>本地待处理</span><strong>${tasks.filter(t => t.status === 'pending').length}</strong></div>
      <div class="task-kpi"><span>审批中</span><strong>${tasks.filter(t => t.status === 'submitted').length}</strong></div>
      <div class="task-kpi"><span>已完成</span><strong>${tasks.filter(t => t.status === 'done').length}</strong></div>
    </div>
  `;
  $('#todayTaskBoard').innerHTML = `
    <div class="panel-head"><div><span class="eyebrow">Local tasks</span><h3>今日待办</h3></div><span class="panel-note">本地 Agent 演练</span></div>
    <div class="task-list">${actions.map(a => `
      <div class="task-row"><div class="task-main"><strong>${esc(a.material)} · ${esc(a.plant)}</strong><span>${esc(a.supplier)} · ${esc(a.must_order_by || '待排期')} · ${compact(a.suggested_replenishment, 0)} kg</span></div><div class="task-side"><span class="status-badge ${a.decision_bucket === 'overdue' ? 'rejected' : 'pending'}">${a.decision_bucket === 'overdue' ? '已逾期' : '待处理'}</span><button class="btn small" data-create-task="${esc(a.key)}">生成任务</button></div></div>
    `).join('')}</div>
  `;
  $$('#todayTaskBoard [data-create-task]').forEach(button => button.addEventListener('click', () => {
    const action = state.data.supply.actions.find(a => a.key === button.dataset.createTask);
    if (action) createAgentTaskFromAction(action);
  }));
}

function renderSupplyModules() {
  const d = state.data;
  if (!$('#supplyOverviewPanel')) return;
  const active = d.supply.materials.filter(m => (m.avg_daily || 0) > 0);
  const inTransit = active.reduce((sum, m) => sum + (m.incoming || 0), 0);
  const atp = active.reduce((sum, m) => sum + (m.atp_commit_qty || 0), 0);
  const safetyTotal = active.reduce((sum, m) => sum + (m.safety_stock || 0), 0);
  const replenishmentTotal = active.reduce((sum, m) => sum + (m.suggested_replenishment || 0), 0);
  const coverageValues = active.map(m => m.coverage_days).filter(v => v != null && Number.isFinite(Number(v))).map(Number);
  const avgCoverage = coverageValues.length ? coverageValues.reduce((a, b) => a + b, 0) / coverageValues.length : 0;

  $('#supplyHeroKpis').innerHTML = `
    <article class="home-kpi"><div class="home-kpi-label">在库物料页</div><div class="home-kpi-value blue">${num(active.length)}<small>个</small></div><div class="home-kpi-foot">覆盖 ${d.supply.suppliers.total} 家供应商</div></article>
    <article class="home-kpi"><div class="home-kpi-label">安全库存合计</div><div class="home-kpi-value blue">${compact(safetyTotal, 1)}<small>kg</small></div><div class="home-kpi-foot">按实时安全库存字段汇总</div></article>
    <article class="home-kpi"><div class="home-kpi-label">新建议补货量</div><div class="home-kpi-value orange">${compact(replenishmentTotal, 1)}<small>kg</small></div><div class="home-kpi-foot">行动清单 ${d.supply.actions.length} 项</div></article>
    <article class="home-kpi"><div class="home-kpi-label">平均库存覆盖</div><div class="home-kpi-value">${avgCoverage.toFixed(1)}<small>天</small></div><div class="home-kpi-foot">按有覆盖数据的物料平均</div></article>
  `;

  const materialRows = active.slice().sort((a, b) => {
    const av = a.coverage_days == null ? 99999 : Number(a.coverage_days);
    const bv = b.coverage_days == null ? 99999 : Number(b.coverage_days);
    return av - bv;
  }).slice(0, 10);
  $('#supplyOverviewPanel').innerHTML = `
    <div class="panel-head"><div><span class="eyebrow">Supply overview</span><h3>物料供需明细</h3></div><span class="panel-note">按覆盖天数升序 · 前 10 项</span></div>
    <div class="table-wrap"><table class="data-table"><thead><tr><th>物料</th><th class="num">可用库存</th><th class="num">安全库存</th><th class="num">日均需求</th><th class="num">覆盖天数</th><th class="num">在途</th><th class="num">建议补货</th><th>分档</th></tr></thead><tbody>${materialRows.map(m => {
      const tier = tierDef(tierOf(m));
      const tone = tierOf(m) === 't1' ? 'red' : tierOf(m) === 't2' || tierOf(m) === 't3' ? 'orange' : 'green';
      return `<tr data-supply-material="${esc(m.key)}"><td><span class="strong">${esc(m.material)}</span><span class="sub">${esc(m.description || m.plant)}</span></td><td class="num">${compact(m.available, 0)}</td><td class="num">${compact(m.safety_stock, 0)}</td><td class="num">${num(m.avg_daily, 2)}</td><td class="num ${tone === 'red' ? 'delta-neg' : tone === 'orange' ? 'delta-warn' : ''}">${m.coverage_days == null ? '—' : Number(m.coverage_days).toFixed(1)}</td><td class="num">${compact(m.incoming, 0)}</td><td class="num strong">${compact(m.suggested_replenishment, 0)}</td><td><span class="home-badge ${tone}">${tier.name}</span></td></tr>`;
    }).join('')}</tbody></table></div>
  `;
  $$('#supplyOverviewPanel [data-supply-material]').forEach(row => row.addEventListener('click', () => {
    const material = state.data.supply.materials.find(m => m.key === row.dataset.supplyMaterial);
    if (material) openMaterial(material);
  }));

  const gapRows = active.map(m => ({ ...m, gap_qty: Math.max(0, Math.ceil((m.reorder_point || 0) - (m.available || 0) - (m.incoming || 0))) })).sort((a, b) => b.gap_qty - a.gap_qty);
  if (!state.gapMaterialKey || !gapRows.some(m => m.key === state.gapMaterialKey)) {
    state.gapMaterialKey = gapRows[0]?.key || active[0]?.key || '';
  }
  $('#gapModule').innerHTML = `
    <div class="panel-head"><div><span class="eyebrow">Gap calculation</span><h3>缺口测算</h3></div><span class="panel-note">点击行切换右侧供需曲线</span></div>
    <div class="table-wrap"><table class="data-table"><thead><tr><th>物料</th><th>供应商</th><th class="num">可用</th><th class="num">在途</th><th class="num">再订货点</th><th class="num">缺口</th><th class="num">覆盖天数</th><th>置信度</th></tr></thead><tbody>${gapRows.slice(0, 15).map(m => `<tr data-gap-key="${esc(m.key)}" class="${m.key === state.gapMaterialKey ? 'row-selected' : ''}"><td><span class="strong">${esc(m.material)}</span><span class="sub">${esc(m.plant)}</span></td><td>${esc(m.supplier)}</td><td class="num">${compact(m.available, 0)}</td><td class="num">${compact(m.incoming, 0)}</td><td class="num">${compact(m.reorder_point, 0)}</td><td class="num strong">${compact(m.gap_qty, 0)}</td><td class="num">${m.coverage_days == null ? '—' : Number(m.coverage_days).toFixed(1)}</td><td><span class="badge ${m.confidence === '高' ? 'green' : m.confidence === '低' ? 'red' : 'blue'}">${esc(m.confidence)}</span></td></tr>`).join('')}</tbody></table></div>
  `;
  $$('#gapModule [data-gap-key]').forEach(row => row.addEventListener('click', () => {
    state.gapMaterialKey = row.dataset.gapKey;
    $$('#gapModule [data-gap-key]').forEach(r => r.classList.toggle('row-selected', r === row));
    renderGapTrendChart();
  }));

  const safetyRows = active.slice().sort((a, b) => (b.safety_stock || 0) - (a.safety_stock || 0)).slice(0, 15);
  $('#safetyModule').innerHTML = `
    <div class="panel-head"><div><span class="eyebrow">Safety stock</span><h3>安全库存拆解</h3></div><span class="panel-note">A口径 · P95</span></div>
    <div class="table-wrap"><table class="data-table"><thead><tr><th>物料</th><th class="num">平均日销量</th><th class="num">P95日销量</th><th class="num">平均到货</th><th class="num">P95到货</th><th class="num">缓冲量</th><th class="num">安全库存</th><th>来源</th></tr></thead><tbody>${safetyRows.map(m => `<tr data-material-key="${esc(m.key)}"><td><span class="strong">${esc(m.material)}</span><span class="sub">${esc(m.plant)}</span></td><td class="num">${num(m.avg_daily, 2)}</td><td class="num">${num(m.p95_daily, 2)}</td><td class="num">${num(m.avg_lead_days, 1)}</td><td class="num">${num(m.p95_lead_days, 1)}</td><td class="num">${compact(m.buffer_qty, 0)}</td><td class="num strong">${compact(m.safety_stock, 0)}</td><td>${esc(m.lead_source || '—')}</td></tr>`).join('')}</tbody></table></div>
  `;
  $$('#safetyModule [data-material-key]').forEach(row => row.addEventListener('click', () => { const m = state.data.supply.materials.find(x => x.key === row.dataset.materialKey); if (m) openMaterial(m); }));

  renderGapTrendChart();
}

function renderGapTrendChart() {
  const panel = $('#gapTrendPanel');
  if (!panel || !state.data) return;
  if (state.charts.gapTrendChart) {
    state.charts.gapTrendChart.dispose();
    delete state.charts.gapTrendChart;
  }
  const material = state.data.supply.materials.find(m => m.key === state.gapMaterialKey) || state.data.supply.materials.find(m => (m.avg_daily || 0) > 0);
  if (!material) {
    panel.innerHTML = '<div class="empty-state">暂无可用物料</div>';
    return;
  }
  const asOf = String(state.data.meta.as_of || '').slice(0, 10);
  const start = new Date(asOf + 'T00:00:00');
  const dates = Array.from({ length: 15 }, (_, i) => {
    const dt = new Date(start);
    dt.setDate(dt.getDate() + i);
    return (dt.getMonth() + 1) + '/' + dt.getDate();
  });
  const available = Number(material.available || 0);
  const incoming = Number(material.incoming || 0);
  const daily = Number(material.avg_daily || 0);
  const lead = Math.max(0, Math.ceil(Number(material.avg_lead_days || 0)));
  const safety = Number(material.safety_stock || 0);
  const predicted = dates.map((_, day) => Math.max(0, available + (day >= lead ? incoming : 0) - daily * day));
  const tier = tierDef(tierOf(material));
  const tone = tierOf(material) === 't1' ? 'red' : tierOf(material) === 't2' || tierOf(material) === 't3' ? 'orange' : 'green';
  panel.innerHTML = `
    <div class="panel-head"><div><span class="eyebrow">14-day supply projection</span><h3>${esc(material.material)} · 供需推演</h3></div><button class="text-btn" data-open-gap-detail>查看物料详情</button></div>
    <div class="gap-trend-layout"><div class="chart" id="gapTrendChart" style="height:300px"></div><div class="gap-trend-side"><span class="home-badge ${tone}">${tier.name}</span><div><span>当前可用</span><b>${compact(available, 1)} kg</b></div><div><span>安全库存</span><b>${compact(safety, 1)} kg</b></div><div><span>日均需求</span><b>${num(daily, 2)} kg</b></div><div><span>覆盖天数</span><b>${material.coverage_days == null ? '—' : Number(material.coverage_days).toFixed(1)} 天</b></div><div><span>在途库存</span><b>${compact(incoming, 1)} kg</b></div><div><span>预计到货</span><b>约 ${lead} 天</b></div><div><span>建议补货</span><b class="blue">${compact(material.suggested_replenishment, 0)} kg</b></div></div></div>
  `;
  panel.querySelector('[data-open-gap-detail]')?.addEventListener('click', () => openMaterial(material));
  if (!window.echarts) return;
  ensureChart('gapTrendChart', {
    ...chartTheme(),
    grid: { left: 48, right: 18, top: 28, bottom: 36 },
    tooltip: { trigger: 'axis', ...chartTheme().tooltip },
    legend: { top: 0, right: 12, textStyle: { fontSize: 11, color: CHART_LABEL } },
    xAxis: { type: 'category', boundaryGap: false, data: dates, axisTick: { show: false }, axisLine: { lineStyle: { color: CHART_AXIS } }, axisLabel: { fontSize: 11, color: CHART_LABEL } },
    yAxis: { type: 'value', axisLabel: { formatter: v => compact(v, 0), fontSize: 11, color: CHART_LABEL }, splitLine: { lineStyle: { color: CHART_GRID, type: 'solid' } } },
    series: [
      { name: '预测可用库存', type: 'line', smooth: false, symbol: 'none', data: predicted, lineStyle: { color: tone === 'red' ? CHART_COLORS[4] : tone === 'orange' ? CHART_COLORS[3] : CHART_COLORS[5], width: 1.5 } },
      { name: '安全库存', type: 'line', symbol: 'none', data: dates.map(() => safety), lineStyle: { color: CHART_COLORS[2], width: 1.5, type: 'dashed' } },
      { name: '到货节点', type: 'scatter', symbolSize: 4, data: [[lead, Math.min(predicted[lead] + incoming, Math.max(...predicted, safety))]], itemStyle: { color: CHART_COLORS[0] } },
    ],
  });
}

function simTier(projectedDays) {
  if (projectedDays == null) return 't5';
  if (projectedDays <= 3) return 't1';
  if (projectedDays <= 7) return 't2';
  if (projectedDays <= 14) return 't3';
  return 't4';
}

function simulateSupply(params) {
  const materials = state.data.supply.materials.filter(m => (m.avg_daily || 0) > 0);
  const rows = materials.map(m => {
    const daily = (m.avg_daily || 0) * params.demand;
    const lead = Math.max(0, (m.avg_lead_days || 0) + params.delay);
    const safety = (m.safety_stock || 0) * params.safety;
    const target = daily * lead + safety;
    const availableAndIncoming = (m.available || 0) + (m.incoming || 0);
    const gap = Math.max(0, Math.ceil(target - availableAndIncoming));
    const projectedDays = daily > 0 ? availableAndIncoming / daily : null;
    return { ...m, sim_daily: daily, sim_lead: lead, sim_safety: safety, sim_target: target, sim_gap: gap, projected_days: projectedDays, sim_tier: simTier(projectedDays) };
  });
  const counts = { t1: 0, t2: 0, t3: 0, t4: 0, t5: 0 };
  rows.forEach(r => counts[r.sim_tier]++);
  return {
    rows: rows.sort((a, b) => b.sim_gap - a.sim_gap),
    counts,
    gapCount: rows.filter(r => r.sim_gap > 0).length,
    totalGap: rows.reduce((sum, r) => sum + r.sim_gap, 0),
    affectedSuppliers: new Set(rows.filter(r => r.sim_gap > 0).map(r => r.supplier)).size,
  };
}

function simulationChangedFields(params) {
  const fields = [];
  if (Number(params.horizon) !== 14) fields.push(`周期 ${params.horizon} 天`);
  if (Number(params.demand) !== 1) fields.push(`需求 ${params.demand}×`);
  if (Number(params.delay) !== 0) fields.push(`延迟 +${params.delay} 天`);
  if (Number(params.safety) !== 1) fields.push(`安全库存 +${Math.round((params.safety - 1) * 100)}%`);
  return fields;
}

function simulationRiskDelta(current, baseline, formatter = value => compact(value, 1)) {
  const delta = Number(current || 0) - Number(baseline || 0);
  if (Math.abs(delta) < 0.05) return '<span class="sim-delta flat">持平</span>';
  return `<span class="sim-delta ${delta > 0 ? 'up' : 'down'}">${delta > 0 ? '+' : ''}${formatter(delta)}</span>`;
}
function simulationWindow(days = 10) {
  const start = new Date(String(state.data.meta.as_of || state.data.meta.generated_at || '').slice(0, 10) + 'T00:00:00');
  const validStart = Number.isNaN(start.getTime()) ? new Date() : start;
  return Array.from({ length: days }, (_, index) => {
    const date = new Date(validStart);
    date.setDate(date.getDate() + index);
    return {
      index,
      date,
      label: String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0'),
      weekday: ['日', '一', '二', '三', '四', '五', '六'][date.getDay()],
      weekend: date.getDay() === 0 || date.getDay() === 6,
    };
  });
}

function simulationDayOffset(value, fallback = 0) {
  if (!value) return fallback;
  const target = new Date(String(value).slice(0, 10) + 'T00:00:00');
  const start = new Date(String(state.data.meta.as_of || state.data.meta.generated_at || '').slice(0, 10) + 'T00:00:00');
  if (Number.isNaN(target.getTime()) || Number.isNaN(start.getTime())) return fallback;
  return Math.round((target - start) / 86400000);
}

function simulationGanttHtml(current, base) {
  const days = simulationWindow(10);
  const baseMap = new Map((base.rows || []).map(row => [row.key, row]));
  let tasks = (current.rows || []).filter(row => Number(row.sim_gap || 0) > 0).slice(0, 7);
  if (tasks.length < 5) {
    tasks = (current.rows || []).slice().sort((a, b) => Number(a.projected_days ?? 99999) - Number(b.projected_days ?? 99999)).slice(0, 7);
  }
  if (!tasks.length) return '<div class="empty-state">当前情景没有可展示的模拟任务。</div>';
  const rows = tasks.map((row, index) => {
    const baseRow = baseMap.get(row.key) || row;
    const rawStart = Math.max(0, Math.min(days.length - 1, simulationDayOffset(row.must_order_by, index % 4)));
    const simulatedLead = Math.max(1, Math.ceil(Number(row.sim_lead || row.avg_lead_days || 1)));
    const baseLead = Math.max(1, Math.ceil(Number(baseRow.sim_lead || baseRow.avg_lead_days || 1)));
    const baseGap = Number(baseRow.sim_gap || 0);
    const currentGap = Number(row.sim_gap || 0);
    const gapGrowth = baseGap > 0 ? currentGap / baseGap : currentGap > 0 ? 1.2 : 1;
    const gapPressureDays = Math.max(0, Math.min(3, Math.round((gapGrowth - 1) * 5)));
    const gapPressurePct = Math.round((gapGrowth - 1) * 100);
    const startOffset = Math.max(0, rawStart - gapPressureDays);
    const baselineStartOffset = rawStart;
    const simulatedLength = Math.max(1, Math.min(days.length - startOffset, simulatedLead + gapPressureDays));
    const baselineLength = Math.max(1, Math.min(days.length - baselineStartOffset, baseLead));
    const tier = row.sim_tier || simTier(row.projected_days);
    const barClass = tier === 't1' ? 'risk' : tier === 't2' || tier === 't3' ? 'warn' : 'ok';
    const pressureClass = gapPressurePct > 5 ? ' pressure-up' : '';
    const showBaseline = state.simulation.demand !== 1 || state.simulation.delay !== 0 || state.simulation.safety !== 1;
    return `<div class="sim-gantt-row">
      <div class="sim-gantt-name"><strong>${esc(row.material)}</strong><span>${gapPressurePct > 5 ? `缺口↑${gapPressurePct}% · ` : ''}${esc(row.plant)} · ${esc(row.supplier)}</span></div>
      <div class="sim-gantt-lane">
        <div class="sim-gantt-grid">${days.map(day => `<i class="${day.weekend ? 'weekend' : ''}"></i>`).join('')}</div>
        ${showBaseline ? `<div class="sim-gantt-bar baseline" style="left:${(baselineStartOffset / days.length * 100).toFixed(2)}%;width:${(baselineLength / days.length * 100).toFixed(2)}%" title="基准计划：${esc(row.material)} · ${baseLead} 天"></div>` : ''}
        <button type="button" class="sim-gantt-bar ${barClass}${pressureClass}" data-sim-task="${esc(row.key)}" style="left:${(startOffset / days.length * 100).toFixed(2)}%;width:${(simulatedLength / days.length * 100).toFixed(2)}%" title="${esc(row.material)} · 需求 ${state.simulation.demand}× · 延迟 +${state.simulation.delay} 天 · 缺口相对基准 ${gapPressurePct > 0 ? '+' : ''}${gapPressurePct}% · 计划窗口 ${simulatedLength} 天"><span>${esc(row.material)}</span><em>${simulatedLength}天</em></button>
      </div>
    </div>`;
  }).join('');return `<div class="sim-gantt-scroll"><div class="sim-gantt-inner">
    <div class="sim-gantt-axis"><div class="sim-gantt-axis-name">物料 / 工厂</div><div class="sim-gantt-axis-days">${days.map(day => `<div class="${day.weekend ? 'weekend' : ''} ${day.index === 0 ? 'today' : ''}"><span>周${day.weekday}</span><b>${day.label}</b></div>`).join('')}</div></div>
    ${rows}
    <div class="sim-gantt-today" style="left:calc(150px + (100% - 150px) * ${(0.5 / days.length).toFixed(4)})"></div>
  </div></div>`;
}

function renderProduction() {
  if (!$('#productionPlan')) return;
  if (!state.simulation) state.simulation = { horizon: 14, demand: 1, delay: 0, safety: 1 };
  const base = simulateSupply({ demand: 1, delay: 0, safety: 1 });
  const current = simulateSupply(state.simulation);
  const demandUp = simulateSupply({ demand: 1.2, delay: state.simulation.delay, safety: state.simulation.safety });
  const delayUp = simulateSupply({ demand: state.simulation.demand, delay: state.simulation.delay + 7, safety: state.simulation.safety });
  const changedFields = simulationChangedFields(state.simulation);
  const scenarioChanged = changedFields.length > 0;
  const safetyLabel = state.simulation.safety === 1 ? '当前' : `+${Math.round((state.simulation.safety - 1) * 100)}%`;
  const parameterPills = [
    `周期 <b>${state.simulation.horizon} 天</b>`,
    `需求 <b>${state.simulation.demand}×</b>`,
    `延迟 <b>+${state.simulation.delay} 天</b>`,
    `安全库存 <b>${safetyLabel}</b>`,
  ].map(text => `<span class="sim-feedback-pill">${text}</span>`).join('');
  $('#productionPlan').innerHTML = `
    <div class="panel-head"><div><span class="eyebrow">Scenario inputs</span><h3>推演参数</h3></div><span class="badge amber">不写入正式数据</span></div>
    <div class="sim-controls">
      <div class="sim-field"><label>推演周期</label><select id="simHorizon"><option value="7" ${state.simulation.horizon === 7 ? 'selected' : ''}>7 天</option><option value="14" ${state.simulation.horizon === 14 ? 'selected' : ''}>14 天</option><option value="30" ${state.simulation.horizon === 30 ? 'selected' : ''}>30 天</option></select></div>
      <div class="sim-field"><label>需求倍数</label><select id="simDemand"><option value="0.8" ${state.simulation.demand === 0.8 ? 'selected' : ''}>0.8×</option><option value="1" ${state.simulation.demand === 1 ? 'selected' : ''}>1.0×</option><option value="1.2" ${state.simulation.demand === 1.2 ? 'selected' : ''}>1.2×</option><option value="1.5" ${state.simulation.demand === 1.5 ? 'selected' : ''}>1.5×</option></select></div>
      <div class="sim-field"><label>供应商延迟</label><select id="simDelay"><option value="0" ${state.simulation.delay === 0 ? 'selected' : ''}>不延迟</option><option value="3" ${state.simulation.delay === 3 ? 'selected' : ''}>+3 天</option><option value="7" ${state.simulation.delay === 7 ? 'selected' : ''}>+7 天</option><option value="14" ${state.simulation.delay === 14 ? 'selected' : ''}>+14 天</option></select></div>
      <div class="sim-field"><label>安全库存策略</label><select id="simSafety"><option value="1" ${state.simulation.safety === 1 ? 'selected' : ''}>当前</option><option value="1.25" ${state.simulation.safety === 1.25 ? 'selected' : ''}>提高 25%</option><option value="1.5" ${state.simulation.safety === 1.5 ? 'selected' : ''}>提高 50%</option></select></div>
    </div>
    <div class="sim-param-feedback" id="simParamFeedback" aria-live="polite">
      <div class="sim-feedback-lead"><span class="sim-feedback-state ${scenarioChanged ? 'changed' : ''}">${scenarioChanged ? '已重算' : '基准情景'}</span><strong>${scenarioChanged ? changedFields.join(' · ') : '全部使用当前基准参数'}</strong><span>参数已带入下方缺口、供应商影响与时间轴</span></div>
      <div class="sim-feedback-pills">${parameterPills}</div>
    </div>
    <p class="side-note">推演用当前平均日销量、到货天数和安全库存重算情景缺口；下方模拟进度会随参数同步更新，但不写入正式工单。</p>
    <section class="sim-progress-card${scenarioChanged ? ' is-linked' : ''}" id="simulationProgress" aria-live="polite">
      <div class="sim-progress-head">
        <div><span class="eyebrow">Simulation progress</span><h3>模拟计划进度</h3><p>当前情景缺口 ${current.gapCount} 项 ${simulationRiskDelta(current.gapCount, base.gapCount, value => `${Math.abs(value)} 项`)}，与上方参数同步。</p><div class="sim-progress-context"><span>需求 ${state.simulation.demand}×</span><span>延迟 +${state.simulation.delay} 天</span><span>安全库存 ${safetyLabel}</span></div></div>
        <button class="text-btn" type="button" id="simGanttRunBtn">重新计算</button>
      </div>
      <div class="sim-progress-summary">
        <div class="sim-link-metric"><span>缺口物料</span><strong>${current.gapCount}${simulationRiskDelta(current.gapCount, base.gapCount, value => `${Math.abs(value)} 项`)}</strong></div>
        <div class="sim-link-metric"><span>推演补货量 (kg)</span><strong>${compact(current.totalGap, 1)}${simulationRiskDelta(current.totalGap, base.totalGap)}</strong></div>
        <div class="sim-link-metric"><span>严重档</span><strong>${current.counts.t1}${simulationRiskDelta(current.counts.t1, base.counts.t1, value => `${Math.abs(value)} 项`)}</strong></div>
        <div class="sim-link-metric"><span>受影响供应商</span><strong>${current.affectedSuppliers}${simulationRiskDelta(current.affectedSuppliers, base.affectedSuppliers, value => `${Math.abs(value)} 家`)}</strong></div>
      </div>
      <div class="sim-gantt">${simulationGanttHtml(current, base)}</div>
      <div class="sim-progress-legend"><span><i class="ok"></i>模拟计划</span><span><i class="warn"></i>需关注</span><span><i class="risk"></i>缺料风险</span><span><i class="baseline"></i>基准计划</span><span class="sim-progress-note">缺口压力越大，计划窗口越早启动并延长</span></div>
    </section>
  `;
  ['simHorizon','simDemand','simDelay','simSafety'].forEach(id => {
    document.getElementById(id)?.addEventListener('change', () => {
      state.simulation = {
        horizon: Number($('#simHorizon').value),
        demand: Number($('#simDemand').value),
        delay: Number($('#simDelay').value),
        safety: Number($('#simSafety').value),
      };
      const controlId = id;
      renderProduction();
      document.getElementById(controlId)?.focus();
    });
  });
  $$('#simulationProgress [data-sim-task]').forEach(button => button.addEventListener('click', () => {
    const material = state.data.supply.materials.find(item => item.key === button.dataset.simTask);
    if (material) openMaterial(material);
  }));
  $('#simGanttRunBtn')?.addEventListener('click', () => {
    const card = $('#simulationProgress');
    const button = $('#simGanttRunBtn');
    if (card) card.classList.add('recalculating');
    if (button) { button.disabled = true; button.textContent = '计算中…'; }
    setTimeout(() => renderProduction(), 420);
  });
  $('#demandRecalc').innerHTML = `
    <div class="panel-head"><div><span class="eyebrow">Demand recalculation</span><h3>需求重算</h3></div><span class="panel-note">需求倍数 ${state.simulation.demand}× · 延迟 +${state.simulation.delay} 天</span></div>
    <div class="table-wrap" style="max-height:420px"><table class="data-table"><thead><tr><th>物料</th><th>供应商</th><th class="num">推演日耗</th><th class="num">推演到货</th><th class="num">目标库存</th><th class="num">推演缺口</th><th class="num">覆盖天数</th><th>档位</th></tr></thead><tbody>${current.rows.slice(0, 20).map(r => `<tr data-sim-key="${esc(r.key)}"><td><span class="strong">${esc(r.material)}</span><span class="sub">${esc(r.plant)}</span></td><td>${esc(r.supplier)}</td><td class="num">${num(r.sim_daily, 2)}</td><td class="num">${num(r.sim_lead, 1)}</td><td class="num">${compact(r.sim_target, 0)}</td><td class="num strong">${compact(r.sim_gap, 0)}</td><td class="num">${r.projected_days == null ? '—' : r.projected_days.toFixed(1)}</td><td><span class="badge ${r.sim_tier === 't1' ? 'red' : r.sim_tier === 't2' ? 'orange' : r.sim_tier === 't3' ? 'amber' : 'green'}">${tierDef(r.sim_tier).name}</span></td></tr>`).join('')}</tbody></table></div>
  `;
  $$('#demandRecalc [data-sim-key]').forEach(row => row.addEventListener('click', () => { const m = state.data.supply.materials.find(x => x.key === row.dataset.simKey); if (m) openMaterial(m); }));
  $('#replenishmentSim').innerHTML = `
    <div class="panel-head"><div><span class="eyebrow">Replenishment simulation</span><h3>补货推演结果</h3></div><span class="panel-note">${state.simulation.horizon} 天窗口</span></div>
    <div class="sim-results"><div class="sim-result"><span>新增缺口物料</span><strong>${current.gapCount}</strong></div><div class="sim-result"><span>推演补货量</span><strong>${compact(current.totalGap, 1)}</strong></div><div class="sim-result"><span>受影响供应商</span><strong>${current.affectedSuppliers}</strong></div><div class="sim-result"><span>严重档变化</span><strong>${base.counts.t1} → ${current.counts.t1}</strong></div></div>
    <p class="side-note">推演结果仅用于方案讨论，不自动生成正式采购订单。</p>
  `;
  const scenarios = [
    { name: '基准情景', data: base, cls: 'blue' },
    { name: '需求上浮 20%', data: demandUp, cls: 'orange' },
    { name: '供应商再延迟 7 天', data: delayUp, cls: 'red' },
  ];
  $('#scenarioCompare').innerHTML = `
    <div class="panel-head"><div><span class="eyebrow">Plan comparison</span><h3>保供方案比较</h3></div><span class="panel-note">同一批物料</span></div>
    <div class="scenario-grid">${scenarios.map(s => `<div class="scenario-card"><h4>${s.name}</h4><div class="scenario-metric"><span>严重档</span><strong>${s.data.counts.t1}</strong></div><div class="scenario-metric"><span>缺口物料</span><strong>${s.data.gapCount}</strong></div><div class="scenario-metric"><span>推演补货量</span><strong>${compact(s.data.totalGap, 1)} kg</strong></div><div class="scenario-metric"><span>受影响供应商</span><strong>${s.data.affectedSuppliers}</strong></div></div>`).join('')}</div>
  `;
}

function renderIntelExtras() {
  if (!$('#industryPanel')) return;
  const market = state.data.supply.external_market;
  const items = Array.isArray(market.items) ? market.items : [];
  if (market.available && items.length) {
    const categoryMap = new Map();
    items.forEach(item => {
      const name = item.category || '未分类';
      const entry = categoryMap.get(name) || { name, count: 0, changes: [] };
      entry.count += 1;
      if (hasMarketChange(item.change_pct)) entry.changes.push(Number(item.change_pct));
      categoryMap.set(name, entry);
    });
    const categories = [...categoryMap.values()]
      .map(entry => ({
        ...entry,
        avg: entry.changes.length ? entry.changes.reduce((sum, value) => sum + value, 0) / entry.changes.length : null,
      }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'zh-CN'));
    const maxCategoryCount = Math.max(...categories.map(entry => entry.count), 1);
    const signals = (market.summary?.top_movers?.length ? market.summary.top_movers : items).slice(0, 8);
    $('#industryPanel').innerHTML = `
      <div class="panel-head"><div><span class="eyebrow">Industry supply</span><h3>行业供需信号</h3></div><span class="badge green">WorkBuddy 已接入</span></div>
      <p class="intel-copy">当前行情条目 ${items.length} 个，覆盖 ${categories.length} 个品类；上涨 ${market.summary.rising_count || 0} 个、回落 ${market.summary.falling_count || 0} 个，平均涨跌幅 ${marketChangeText(market.summary.avg_change_pct)}，价格压力比例 ${pct((market.summary.pressure_ratio || 0) * 100)}。</p>
      <p class="side-note">本轮数据以公开原料价格和资讯为主，未包含行业产量、库存缺口字段，因此这里不虚构供需缺口，只展示可核实的品类结构与价格方向。</p>
      <div class="industry-kpis">
        <div class="industry-kpi"><span>覆盖品类</span><strong>${categories.length}</strong></div>
        <div class="industry-kpi"><span>有涨跌样本</span><strong>${market.summary.with_change_count || 0}</strong></div>
        <div class="industry-kpi"><span>上涨 / 回落</span><strong>${market.summary.rising_count || 0} / ${market.summary.falling_count || 0}</strong></div>
        <div class="industry-kpi"><span>平均涨跌幅</span><strong class="${(market.summary.avg_change_pct || 0) > 0 ? 'up' : (market.summary.avg_change_pct || 0) < 0 ? 'down' : ''}">${marketChangeText(market.summary.avg_change_pct)}</strong></div>
      </div>
      <div class="industry-category-grid">${categories.map(entry => {
        const width = Math.max(12, Math.round(entry.count / maxCategoryCount * 100));
        return `<div class="industry-category-card"><div class="industry-category-head"><strong>${esc(entry.name)}</strong><span>${entry.count} 项</span></div><div class="industry-category-bar"><i style="width:${width}%"></i></div><div class="industry-category-meta"><span>${entry.changes.length ? '有涨跌 ' + entry.changes.length + ' 项' : '暂无涨跌'}</span><b class="${(entry.avg || 0) > 0 ? 'up' : (entry.avg || 0) < 0 ? 'down' : ''}">${entry.avg == null ? '—' : marketChangeText(entry.avg)}</b></div></div>`;
      }).join('')}</div>
      <div class="industry-signal-list">${signals.map(item => {
        const direction = marketDirection(item.change_pct);
        return `<div class="industry-signal-row"><div class="industry-signal-name"><strong>${esc(item.name)}</strong><span>${esc(item.category || '未分类')}</span></div><div class="industry-signal-price"><b>${marketPriceText(item)}</b><em class="${direction.cls}">${direction.label} ${marketChangeText(item.change_pct)}</em></div><p>${esc(item.summary || '暂无进一步摘要')}</p></div>`;
      }).join('')}</div>
    `;
  } else {
    $('#industryPanel').innerHTML = '<div class="empty-state">WorkBuddy 尚未写入行业供需数据。接入后将在这里展示行业景气、供需缺口和价格压力。</div>';
  }

}

function renderAICenter() {
  renderWorkBuddy();
  renderAIChat();
  renderAITasks();
  renderAIApproval();
  renderAIEvidence();
  renderAIReview();
  $('#aiCreateTaskBtn')?.addEventListener('click', () => {
    setRoute('ai/tasks');
    setTimeout(() => $('#aiTaskMaterial')?.focus(), 120);
  });
  $('#aiEvidenceMethodBtn')?.addEventListener('click', openMethod);
}

function formatWorkBuddyTime(value) {
  if (!value) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value).replace('T', ' ');
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(parsed).replace(/\//g, '-');
}

function renderWorkBuddy() {
  if (!$('#workbuddyDashboard')) return;
  const d = state.data;
  const market = d.supply.external_market;
  const generatedAt = formatWorkBuddyTime(d.meta.generated_at || d.meta.as_of);
  const marketAt = formatWorkBuddyTime(market.updated_at || d.meta.as_of);
  const sourceFile = d.meta.source_file || 'SAP 脱敏工作簿';
  const materialCount = d.supply.materials.length;
  const actionCount = d.supply.actions.length;
  const supplierCount = d.supply.suppliers.items.length;
  const marketCount = Array.isArray(market.items) ? market.items.length : 0;
  const repoUrl = 'https://github.com/Xiejiananaa/Xiejiananaa.github.io';
  const actionsUrl = repoUrl + '/actions';
  const steps = [
    { title: 'WorkBuddy 定时调度', text: '外部 Agent 触发 SAP 数据协同任务，不占用业务人员终端操作。', meta: '已接入' },
    { title: 'SAP 库存抓取', text: 'ZWM002 库存、ME2L 采购计划、MB51 实际收货统一导出。', meta: 'SAP GUI' },
    { title: '自动翻译与部分脱敏', text: '生成供应雷达总表，过滤历史工厂与无消耗行，仅保留比赛口径。', meta: 'competition' },
    { title: 'JSON 编译', text: materialCount + ' 个物料/工厂组合、' + actionCount + ' 条行动、' + supplierCount + ' 家供应商。', meta: generatedAt },
    { title: '发布前安全校验', text: '校验工厂范围、脱敏名称、1160 数据、字段结构与行数一致性。', meta: '通过' },
    { title: 'GitHub Pages 发布', text: 'GitHub Actions 自动构建并发布，前端直接读取 dashboard_data.json。', meta: '已部署' },
  ];
  $('#workbuddyDashboard').innerHTML = `
    <section class="workbuddy-hero">
      <div class="workbuddy-hero-top">
        <div class="workbuddy-identity">
          <span class="workbuddy-avatar" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none"><path d="m12 3-1.2 3.3L7.5 7.5l3.3 1.2L12 12l1.2-3.3 3.3-1.2-3.3-1.2L12 3Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="m5 14-.8 2.2L2 17l2.2.8L5 20l.8-2.2L8 17l-2.2-.8L5 14Z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/><path d="m19 13-.6 1.6L17 15l1.4.6L19 17l.6-1.4L21 15l-1.4-.4L19 13Z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg></span>
          <div><span class="eyebrow">External agent</span><h3>WorkBuddy</h3><p>SAP 数据自动化 · 定时协同 · GitHub 发布</p></div>
        </div>
        <span class="workbuddy-online"><i></i>最近一次协同成功</span>
      </div>
      <div class="workbuddy-kpis">
        <div class="workbuddy-kpi"><span>最近运行</span><strong>${esc(generatedAt)}</strong><em>数据生成时间</em></div>
        <div class="workbuddy-kpi"><span>业务数据</span><strong>${materialCount}<small> 项</small></strong><em>${actionCount} 条行动 · ${supplierCount} 家供应商</em></div>
        <div class="workbuddy-kpi"><span>外部行情</span><strong>${marketCount}<small> 条</small></strong><em>${esc(marketAt)} 更新</em></div>
        <div class="workbuddy-kpi"><span>交付通道</span><strong class="word">GitHub Pages</strong><em>Actions 自动部署</em></div>
      </div>
      <p class="workbuddy-disclaimer">本页展示 WorkBuddy 最近一次协同产生的数据与发布证据。比赛演示无需打开 PowerShell 或 SAP GUI。</p>
    </section>
    <div class="workbuddy-main-grid">
      <section class="workbuddy-card">
        <div class="workbuddy-card-head"><div><span class="eyebrow">Agent execution</span><h3>本次协同链路</h3></div><span class="badge green">全部完成</span></div>
        <div class="workbuddy-flow">${steps.map((step, index) => `<div class="workbuddy-step"><span class="workbuddy-step-mark">${index < steps.length - 1 ? '<svg viewBox="0 0 16 16" fill="none"><path d="m4 8.2 2.4 2.4L12 5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>' : '<svg viewBox="0 0 16 16" fill="none"><path d="M8 2.5v3M8 10.5v3M2.5 8h3M10.5 8h3" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>'}</span><div><strong>${esc(step.title)}</strong><p>${esc(step.text)}</p></div><em>${esc(step.meta)}</em></div>`).join('')}</div>
      </section>
      <aside class="workbuddy-card workbuddy-evidence">
        <div class="workbuddy-card-head"><div><span class="eyebrow">Run evidence</span><h3>运行证据</h3></div></div>
        <div class="workbuddy-evidence-list">
          <div><span>Agent 身份</span><strong>WorkBuddy</strong></div>
          <div><span>执行状态</span><strong class="success">成功</strong></div>
          <div><span>SAP 工作簿</span><strong title="${esc(sourceFile)}">${esc(sourceFile)}</strong></div>
          <div><span>数据契约</span><strong>${esc(d.meta.contract_version || '—')}</strong></div>
          <div><span>运行模式</span><strong>${esc(d.meta.mode === 'competition' ? '比赛脱敏版' : '内部版')}</strong></div>
          <div><span>数据范围</span><strong>${esc(d.meta.mode === 'competition' ? '工厂 1501' : '全部工厂')}</strong></div>
        </div>
        <div class="workbuddy-links">
          <a href="${actionsUrl}" target="_blank" rel="noopener noreferrer">查看 GitHub Actions <span>↗</span></a>
          <a href="${repoUrl}" target="_blank" rel="noopener noreferrer">打开 GitHub 仓库 <span>↗</span></a>
        </div>
        <p class="workbuddy-evidence-note">页面能读取当前 JSON，且校验与部署由 GitHub Actions 再次执行，构成可追溯的 Agent 协同回执。</p>
      </aside>
    </div>
    <section class="workbuddy-audit">
      <div><span class="eyebrow">Audit trail</span><h3>为什么这不是静态假数据</h3></div>
      <div class="workbuddy-audit-grid">
        <div><strong>SAP 原始输出</strong><p>ZWM002、ME2L、MB51 三类数据由自动化脚本抓取。</p></div>
        <div><strong>确定性编译</strong><p>${materialCount} 项业务数据由 Python 从 Excel 计算生成。</p></div>
        <div><strong>发布时再次校验</strong><p>GitHub Actions 校验通过后才部署，失败不会覆盖线上版本。</p></div>
      </div>
    </section>
  `;
}

function renderAIChat() {
  if (!$('#aiChatMessages')) return;
  if (!$('#aiChatMessages').dataset.ready) {
    $('#aiChatMessages').dataset.ready = '1';
    addAiChatMessage('你好，我是供应雷达助手。可以问我紧急物料、逾期 PO、ATP、供应商、库龄，或直接输入物料编码查看建议依据。', 'bot', '本地数据问答');
    const suggestions = ['今天最紧急的物料', '哪些 PO 已逾期', '哪些供应商需要关注', 'ATP 为 0 的物料'];
    $('#aiChatSuggestions').innerHTML = suggestions.map(text => `<button class="suggestion" type="button">${esc(text)}</button>`).join('');
    $$('#aiChatSuggestions .suggestion').forEach(button => button.addEventListener('click', () => {
      $('#aiChatInput').value = button.textContent;
      $('#aiChatForm').requestSubmit();
    }));
    $('#aiChatForm').addEventListener('submit', event => {
      event.preventDefault();
      const question = $('#aiChatInput').value.trim();
      if (!question) return;
      $('#aiChatInput').value = '';
      addAiChatMessage(question, 'user');
      const answer = answerQuestion(question);
      setTimeout(() => addAiChatMessage(answer.text, 'bot', answer.source), 150);
    });
  }
}

function addAiChatMessage(text, type, source = '') {
  const message = document.createElement('div');
  message.className = 'msg ' + type;
  message.textContent = text;
  if (source) {
    const meta = document.createElement('small');
    meta.textContent = source;
    message.appendChild(meta);
  }
  $('#aiChatMessages').appendChild(message);
  $('#aiChatMessages').scrollTop = $('#aiChatMessages').scrollHeight;
}

function taskStatusText(status) {
  return { pending: '待处理', progress: '处理中', submitted: '审批中', done: '已完成', rejected: '已驳回' }[status] || status;
}

function taskStatusClass(status) {
  return { pending: 'pending', progress: 'progress', submitted: 'progress', done: 'done', rejected: 'rejected' }[status] || '';
}

function renderAITasks() {
  if (!$('#aiTaskSummary')) return;
  const tasks = loadAgentTasks();
  const actions = state.data.supply.actions;
  const submitted = tasks.filter(t => t.status === 'submitted').length;
  const progress = tasks.filter(t => t.status === 'progress').length;
  const done = tasks.filter(t => t.status === 'done').length;
  const focusTask = tasks[0] || null;
  const focusAction = focusTask
    ? actions.find(a => a.material === focusTask.material && a.plant === focusTask.plant) || actions[0]
    : actions[0];
  $('#aiTaskSummary').innerHTML = `
    <div class="task-kpis">
      <div class="task-kpi"><span>今日生成建议</span><strong>${actions.length}</strong></div>
      <div class="task-kpi"><span>待审批</span><strong>${submitted}</strong></div>
      <div class="task-kpi"><span>执行中</span><strong>${progress}</strong></div>
      <div class="task-kpi"><span>已完成</span><strong>${done}</strong></div>
    </div>
  `;

  const actionOptions = actions.map(a => `<option value="${esc(a.key)}">${esc(a.material)} · ${esc(a.plant)} · ${compact(a.suggested_replenishment, 0)} kg</option>`).join('');
  const focusStatus = focusTask ? taskStatusText(focusTask.status) : '待创建任务';
  const coverage = focusAction?.coverage_days == null ? '—' : Number(focusAction.coverage_days).toFixed(1) + ' 天';
  const flow = [
    { title: '数据刷新', text: '库存、在途、供应商绩效与需求覆盖快照已加载。', status: '已完成' },
    { title: '风险识别', text: focusAction ? focusAction.material + ' · ' + focusAction.plant + '，覆盖 ' + coverage + '；' + (focusAction.risk_reason || '—') : '暂无可用行动数据。', status: focusAction ? '已完成' : '待接入' },
    { title: '方案测算', text: focusAction ? '建议补货 ' + compact(focusAction.suggested_replenishment, 0) + ' kg，置信度 ' + (focusAction.confidence || '—') + '。' : '暂无测算结果。', status: focusAction ? '已完成' : '待接入' },
    { title: '任务执行', text: focusTask ? focusTask.material + ' · ' + focusTask.plant + '，负责人 ' + (focusTask.owner || '待指派') : '尚未创建本地任务，可从下方补货建议发起。', status: focusStatus },
    { title: '审批与复盘', text: submitted ? submitted + ' 项正在审批，完成后进入效果复盘。' : done + ' 项已完成闭环，等待更多执行记录。', status: submitted ? '审批中' : done ? '已闭环' : '待执行' },
  ];
  $('#aiTaskBoard').innerHTML = `
    <div class="panel-head"><div><span class="eyebrow">Execution chain</span><h3>任务执行链路</h3></div><span class="panel-note">本地 Agent 演练</span></div>
    <div class="ai-execution-grid">
      <div class="ai-flow">${flow.map((step, index) => `<div class="ai-flow-item"><span class="ai-flow-dot ${index < 3 ? 'done' : index === 3 ? 'active' : ''}"></span><div><strong>${esc(step.title)}</strong><p>${esc(step.text)}</p></div><em>${esc(step.status)}</em></div>`).join('')}</div>
      <div class="ai-evidence-panel"><div class="ai-evidence-head"><strong>决策依据</strong><span>可追溯到 JSON</span></div>${focusAction ? `
        <div class="ai-evidence-row"><span>数据来源</span><b>${esc(state.data.meta.source_file)}</b></div>
        <div class="ai-evidence-row"><span>日销量样本</span><b>${focusAction.demand_samples ?? 0}</b></div>
        <div class="ai-evidence-row"><span>到货天数样本</span><b>${focusAction.lead_samples ?? 0}</b></div>
        <div class="ai-evidence-row"><span>到货天数来源</span><b>${esc(focusAction.lead_source || '—')}</b></div>
        <div class="ai-evidence-row"><span>安全库存</span><b>${compact(focusAction.safety_stock, 0)} kg</b></div>
        <div class="ai-evidence-row"><span>再订货点</span><b>${compact(focusAction.reorder_point, 0)} kg</b></div>
        <div class="ai-evidence-note">${esc(focusAction.review_note || '当前没有额外复核提示。')}</div>
      ` : '<div class="empty-state">暂无行动数据</div>'}</div>
    </div>
    <div class="divider" style="margin:18px 0"></div>
    <div class="panel-head"><div><span class="eyebrow">Create task</span><h3>从补货建议创建任务</h3></div><span class="panel-note">本地 Agent 演练</span></div>
    <form id="aiTaskCreateForm" class="sim-controls ai-task-create-form"><div class="sim-field"><label>补货建议</label><select id="aiTaskMaterial">${actionOptions}</select></div><div class="sim-field"><label>负责人</label><input id="aiTaskOwner" placeholder="例如：采购员 A"></div><div class="sim-field"><label>截止日期</label><input id="aiTaskDue" type="date"></div><button class="btn primary" type="submit" style="align-self:end;min-height:34px">创建任务</button></form>
    <div class="task-list" style="margin-top:14px">${tasks.map(task => `<div class="task-row"><div class="task-main"><strong>${esc(task.material)} · ${esc(task.plant)}</strong><span>${esc(task.owner || '待指派')} · 截止 ${esc(task.dueDate || '未设置')} · ${compact(task.qty, 0)} kg</span></div><div class="task-side"><span class="status-badge ${taskStatusClass(task.status)}">${taskStatusText(task.status)}</span><button class="btn small" data-task-progress="${task.id}">推进</button><button class="btn small" data-task-submit="${task.id}">提交审批</button><button class="btn small" data-task-done="${task.id}">完成</button></div></div>`).join('') || '<div class="empty-state">还没有本地 Agent 任务，可从上方补货建议创建。</div>'}</div>
  `;
  $('#aiTaskCreateForm')?.addEventListener('submit', event => {
    event.preventDefault();
    const action = state.data.supply.actions.find(a => a.key === $('#aiTaskMaterial').value);
    if (!action) return;
    createAgentTaskFromAction(action, $('#aiTaskOwner').value.trim() || '待指派', $('#aiTaskDue').value || '');
  });
  $$('#aiTaskBoard [data-task-progress]').forEach(button => button.addEventListener('click', () => updateTaskStatus(button.dataset.taskProgress, 'progress')));
  $$('#aiTaskBoard [data-task-submit]').forEach(button => button.addEventListener('click', () => updateTaskStatus(button.dataset.taskSubmit, 'submitted')));
  $$('#aiTaskBoard [data-task-done]').forEach(button => button.addEventListener('click', () => updateTaskStatus(button.dataset.taskDone, 'done')));
}

function updateTaskStatus(id, status) {
  const tasks = loadAgentTasks();
  const task = tasks.find(t => t.id === id);
  if (!task) return;
  task.status = status;
  task.updatedAt = new Date().toISOString();
  saveAgentTasks(tasks);
  refreshTaskViews();
  showToast('任务状态已更新为' + taskStatusText(status));
}

function renderAIApproval() {
  if (!$('#aiApprovalSummary')) return;
  const tasks = loadAgentTasks();
  const submitted = tasks.filter(t => t.status === 'submitted');
  $('#aiApprovalSummary').innerHTML = `
    <div class="task-kpis">
      <div class="task-kpi"><span>待审批</span><strong>${submitted.length}</strong></div>
      <div class="task-kpi"><span>已通过</span><strong>${tasks.filter(t => t.status === 'done').length}</strong></div>
      <div class="task-kpi"><span>已驳回</span><strong>${tasks.filter(t => t.status === 'rejected').length}</strong></div>
      <div class="task-kpi"><span>全部任务</span><strong>${tasks.length}</strong></div>
    </div>
  `;
  $('#aiApprovalBoard').innerHTML = `
    <div class="panel-head"><div><span class="eyebrow">Approval queue</span><h3>本地审批队列</h3></div><span class="panel-note">仅演示，不接入真实审批系统</span></div>
    <div class="task-list">${submitted.map(task => `<div class="task-row"><div class="task-main"><strong>${esc(task.material)} · ${esc(task.plant)}</strong><span>${esc(task.owner)} · ${compact(task.qty, 0)} kg · ${esc(task.evidence || '')}</span></div><div class="task-side"><button class="btn small" data-approve="${task.id}">通过</button><button class="btn small danger" data-reject="${task.id}">驳回</button></div></div>`).join('') || '<div class="empty-state">暂无待审批任务。请先在“任务执行”中提交审批。</div>'}</div>
  `;
  $$('#aiApprovalBoard [data-approve]').forEach(button => button.addEventListener('click', () => updateTaskStatus(button.dataset.approve, 'done')));
  $$('#aiApprovalBoard [data-reject]').forEach(button => button.addEventListener('click', () => updateTaskStatus(button.dataset.reject, 'rejected')));
}

function renderAIEvidence() {
  if (!$('#aiEvidence')) return;
  const d = state.data;
  const formulas = (d.provenance.formulas || []).map(f => `<div class="evidence-card"><h4>${esc(f.field)}</h4><p>${esc(f.formula)}</p><p>${esc(f.note || '')}</p></div>`).join('');
  const sources = Object.entries(d.provenance.sources || {}).map(([key, value]) => `<li>${esc(key)} → ${esc(value)}</li>`).join('');
  $('#aiEvidence').innerHTML = `
    <div class="panel-head"><div><span class="eyebrow">Evidence</span><h3>决策依据与口径</h3></div><span class="badge blue">可追溯</span></div>
    <div class="evidence-grid"><div class="evidence-card"><h4>数据来源</h4><ul>${sources}</ul></div><div class="evidence-card"><h4>当前供应信号</h4><p>物料 ${d.supply.materials.length} 项，严重档 ${tierCounts(d.supply.materials).t1} 项，采购行动 ${d.supply.actions.length} 项。</p><p>数据日期 ${esc(d.meta.as_of)}；来源 ${esc(d.meta.source_file)}。</p></div></div>
    <div style="height:12px"></div>
    <div class="evidence-grid">${formulas}</div>
    <p class="side-note" style="margin-top:12px">页面中的建议补货量在 Python 生成器重算，前端不重复改写正式计算结果。</p>
  `;
}

function renderAIReview() {
  if (!$('#aiReviewSummary')) return;
  const tasks = loadAgentTasks();
  const done = tasks.filter(t => t.status === 'done').length;
  const rejected = tasks.filter(t => t.status === 'rejected').length;
  const completion = tasks.length ? done / tasks.length * 100 : 0;
  const counts = tierCounts(state.data.supply.materials);
  $('#aiReviewSummary').innerHTML = `
    <div class="task-kpis">
      <div class="task-kpi"><span>任务完成率</span><strong>${completion.toFixed(0)}%</strong></div>
      <div class="task-kpi"><span>已完成任务</span><strong>${done}</strong></div>
      <div class="task-kpi"><span>驳回任务</span><strong>${rejected}</strong></div>
      <div class="task-kpi"><span>当前严重档</span><strong>${counts.t1}</strong></div>
    </div>
  `;
  $('#aiReviewBoard').innerHTML = `
    <div class="panel-head"><div><span class="eyebrow">Review trail</span><h3>执行复盘</h3></div><span class="panel-note">本地任务状态</span></div>
    <div class="task-list">${tasks.slice(0, 12).map(task => `<div class="task-row"><div class="task-main"><strong>${esc(task.material)} · ${esc(task.plant)}</strong><span>${esc(task.owner)} · ${taskStatusText(task.status)} · ${dateText(task.createdAt)}</span></div><div class="task-side"><span class="status-badge ${taskStatusClass(task.status)}">${taskStatusText(task.status)}</span></div></div>`).join('') || '<div class="empty-state">还没有执行记录。创建并推进任务后，这里会形成复盘轨迹。</div>'}</div>
    <p class="side-note">当前复盘基于本地任务状态，不包含后续真实到货结果。接入历史快照后可对比建议前后库存和补货变化。</p>
  `;
}

function initGlobalUI() {
  $('#drawerClose')?.addEventListener('click', closeDrawer);
  $('#drawerMask')?.addEventListener('click', closeDrawer);
  $('#methodClose')?.addEventListener('click', closeMethod);
  $('#methodModal')?.addEventListener('click', event => {
    if (event.target === $('#methodModal')) closeMethod();
  });
  $('#showMethodBtn')?.addEventListener('click', openMethod);
  $('#clock').textContent = new Date().toLocaleTimeString('zh-CN', { hour12: false });
  setInterval(() => {
    $('#clock').textContent = new Date().toLocaleTimeString('zh-CN', { hour12: false });
  }, 1000);
  /* 演示用：?mega=<view> 直接展开对应速览面板 */
  const megaView = new URLSearchParams(location.search).get('mega');
  if (megaView && NAV_VIEWS.includes(megaView)) {
    setTimeout(() => showMega(megaView), 400);
  }
}

document.addEventListener('DOMContentLoaded', loadData);
