/* Supplier distribution map: local SVG geometry with no external map service. */
(function (global) {
  const RISK = {
    red: { label: '高风险', color: '#ef4444' },
    orange: { label: '需关注', color: '#f59e0b' },
    yellow: { label: '关注', color: '#eab308' },
    ok: { label: '正常', color: '#10b981' },
  };

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function norm(value) {
    return String(value || '')
      .replace(/(维吾尔|壮族|回族|特别行政区|自治区|自治州|省|市)/g, '')
      .trim();
  }

  function project(lng, lat) {
    const G = global.CHINA_GEO;
    const p = G.proj;
    const R = p.R;
    const x = (Math.PI / 180 * lng * R - p.ox) * p.scale;
    const y = (-Math.log(Math.tan(Math.PI / 4 + Math.PI / 180 * lat / 2)) * R - p.oy) * p.scale;
    return [x, y];
  }

  function riskOf(value) {
    const text = String(value || '');
    if (text.includes('高') || text.includes('紧急')) return 'red';
    if (text.includes('关注')) return 'orange';
    if (text.includes('低') || text.includes('正常')) return 'ok';
    return 'yellow';
  }

  function buildMap(model) {
    const G = global.CHINA_GEO;
    if (!G) return '<div class="empty-state">地图底图未加载</div>';
    const provinceStats = new Map((model.provinces || []).map(item => [norm(item.name), item]));
    const defs = G.provinces.map(p => `<path id="sm-pv-${p.code}" d="${p.d}"/>`).join('');
    const provinceUse = G.provinces.map(province => {
      const stats = provinceStats.get(norm(province.name)) || {};
      const risk = riskOf(stats.riskLabel);
      const cls = risk === 'red' ? 'hot' : risk === 'orange' || risk === 'yellow' ? 'warm' : '';
      return `<use href="#sm-pv-${province.code}" class="sm-province ${cls}" data-province="${esc(province.name)}" tabindex="0" role="button" aria-label="${esc(province.name)}，${Number(stats.supplierCount || 0)} 家供应商"/>`;
    }).join('');

    const labels = [
      ['北京市', 116.4, 39.9, '北京'], ['上海市', 121.47, 31.2, '上海'],
      ['广东省', 113.5, 23.3, '广东'], ['四川省', 102.7, 30.2, '四川'],
      ['新疆维吾尔自治区', 85.5, 41.5, '新疆'], ['黑龙江省', 127.5, 47.5, '黑龙江'],
      ['西藏自治区', 88.5, 31.5, '西藏'], ['内蒙古自治区', 112.5, 43.5, '内蒙古'],
      ['福建省', 118.2, 26.1, '福建'], ['山东省', 118.5, 36.4, '山东'],
      ['云南省', 101.5, 25.0, '云南'], ['台湾省', 121.95, 23.15, '台湾'],
    ].map(([name, lng, lat, label]) => {
      const [x, y] = project(lng, lat);
      return `<text class="sm-map-label" x="${x.toFixed(1)}" y="${y.toFixed(1)}" text-anchor="middle">${esc(label)}</text>`;
    }).join('');

    const cities = (model.cities || []).map((city, index) => {
      const [x, y] = project(city.lon, city.lat);
      const risk = RISK[city.risk] ? city.risk : 'ok';
      const radius = 3.2 + Math.min(3.2, Number(city.supplierCount || 1) * 0.72);
      const color = RISK[risk].color;
      return `<g class="sm-city-marker" data-city-id="${esc(city.id)}" transform="translate(${x.toFixed(1)},${y.toFixed(1)})" tabindex="0" role="button" aria-label="${esc(city.name)}，${Number(city.supplierCount || 0)} 家供应商，${esc(RISK[risk].label)}">
        <circle class="sm-city-halo" r="${radius}" fill="${color}" style="animation-delay:-${(index * 0.41).toFixed(2)}s"/>
        <circle class="sm-city-core" r="${radius}" fill="${color}"/>
      </g>`;
    }).join('');

    const inset = G.inset;
    const boxW = 152;
    const boxH = 210;
    const boxX = 834;
    const boxY = 494;
    const scale = Math.min(boxW / inset.w, boxH / inset.h);
    const tx = boxX + (boxW - inset.w * scale) / 2 - inset.x * scale;
    const ty = boxY + (boxH - inset.h * scale) / 2 - inset.y * scale;

    return `<svg class="sm-map-svg" viewBox="0 0 ${G.w.toFixed(0)} ${G.h.toFixed(0)}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="全国供应商风险分布地图">
      <defs>${defs}</defs>
      <g>${provinceUse}</g>
      <g class="sm-map-outline">${G.provinces.map(p => `<use href="#sm-pv-${p.code}"/>`).join('')}</g>
      ${labels}
      <g>${cities}</g>
      <g transform="translate(${tx.toFixed(1)},${ty.toFixed(1)}) scale(${scale.toFixed(4)})" style="pointer-events:none">
        <rect class="sm-map-inset" x="${inset.x}" y="${inset.y}" width="${inset.w}" height="${inset.h}" rx="${(6 / scale).toFixed(1)}"/>
        <use href="#sm-pv-460000" style="fill:#17324a;stroke:#4f8cff;stroke-width:1.4"/>
        <path class="sm-map-nine-dash" d="${G.jd}"/>
      </g>
      <text class="sm-map-inset-label" x="${boxX + 9}" y="${boxY + 18}">南海诸岛</text>
      <text class="sm-map-inset-label" x="${boxX + boxW - 9}" y="${boxY + 188}" text-anchor="end">GS(2019)1719</text>
    </svg>`;
  }

  function bindMap(root, model, handlers) {
    handlers = handlers || {};
    const wrap = root.querySelector('.sm-map-wrap');
    if (!wrap) return;
    const tip = wrap.querySelector('.sm-map-tip');
    const svg = wrap.querySelector('.sm-map-svg');
    const provinceMap = new Map((model.provinces || []).map(item => [norm(item.name), item]));
    const cityMap = new Map((model.cities || []).map(item => [item.id, item]));

    function place(event) {
      const rect = wrap.getBoundingClientRect();
      tip.style.left = (event.clientX - rect.left) + 'px';
      tip.style.top = (event.clientY - rect.top) + 'px';
      tip.classList.add('on');
    }

    function hide() {
      tip.classList.remove('on');
    }

    function selectProvince(target, name) {
      svg.querySelectorAll('.sm-province.lit').forEach(node => node.classList.remove('lit'));
      target.classList.add('lit');
      const stats = provinceMap.get(norm(name)) || null;
      if (handlers.onSelect) handlers.onSelect({ type: 'province', name, data: stats });
    }

    Array.prototype.forEach.call(svg.querySelectorAll('.sm-province'), node => {
      const name = node.dataset.province;
      const stats = provinceMap.get(norm(name)) || {};
      node.addEventListener('mouseenter', event => {
        tip.innerHTML = `<b>${esc(name)}</b>
          <div class="row"><span>供应商</span><s>${Number(stats.supplierCount || 0)} 家</s></div>
          <div class="row"><span>高风险</span><s>${Number(stats.criticalCount || 0)} 家</s></div>
          <div class="row"><span>订单</span><s>${Number(stats.orders || 0)} 单</s></div>`;
        place(event);
      });
      node.addEventListener('mousemove', place);
      node.addEventListener('mouseleave', hide);
      node.addEventListener('click', () => selectProvince(node, name));
      node.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          selectProvince(node, name);
        }
      });
    });

    Array.prototype.forEach.call(svg.querySelectorAll('.sm-city-marker'), node => {
      const city = cityMap.get(node.dataset.cityId);
      if (!city) return;
      node.addEventListener('mouseenter', event => {
        tip.innerHTML = `<b>${esc(city.name)}</b>
          <div class="row"><span>风险等级</span><s style="color:${RISK[city.risk].color}">${RISK[city.risk].label}</s></div>
          <div class="row"><span>供应商</span><s>${Number(city.supplierCount || 0)} 家</s></div>
          <div class="row"><span>缺收货</span><s>${Number(city.missingReceipts || 0)} 单</s></div>`;
        place(event);
      });
      node.addEventListener('mousemove', place);
      node.addEventListener('mouseleave', hide);
      node.addEventListener('click', () => {
        if (handlers.onSelect) handlers.onSelect({ type: 'city', id: city.id, data: city });
      });
      node.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          if (handlers.onSelect) handlers.onSelect({ type: 'city', id: city.id, data: city });
        }
      });
    });
  }

  global.SUPPLIER_MAP = { RISK, project, buildMap, bindMap };
})(window);