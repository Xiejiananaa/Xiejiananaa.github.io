# -*- coding: utf-8 -*-
"""Build a single-file, offline supply radar discussion page."""
from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
HTML = ROOT / "index.html"
CSS = ROOT / "assets" / "styles.css"
APP = ROOT / "assets" / "app.js"
CHINA_MAP_GEO = ROOT / "assets" / "china-map-geo.js"
SUPPLIER_MAP = ROOT / "assets" / "supplier-map.js"
ECHARTS = ROOT / "assets" / "echarts.min.js"
GEO = ROOT / "assets" / "china.geo.json"
DATA = ROOT / "data" / "dashboard_data.json"
OUTPUT = ROOT / "dist" / "供应雷达-分享讨论版.html"


def safe_script(text: str) -> str:
    return text.replace("</script", "<\\/script")


def main() -> int:
    html = HTML.read_text(encoding="utf-8")
    css = CSS.read_text(encoding="utf-8")
    app = APP.read_text(encoding="utf-8")
    china_map_geo = CHINA_MAP_GEO.read_text(encoding="utf-8")
    supplier_map = SUPPLIER_MAP.read_text(encoding="utf-8")
    echarts = ECHARTS.read_text(encoding="utf-8")
    geo = json.loads(GEO.read_text(encoding="utf-8"))
    data = json.loads(DATA.read_text(encoding="utf-8"))

    html = re.sub(
        r'<link rel="stylesheet" href="\./assets/styles\.css(?:\?[^"]*)?">',
        f"<style>\n{css}\n</style>",
        html,
    )
    html = re.sub(
        r'<script src="\./assets/china-map-geo\.js(?:\?[^"]*)?" defer></script>\s*',
        "",
        html,
    )
    html = re.sub(
        r'<script src="\./assets/supplier-map\.js(?:\?[^"]*)?" defer></script>\s*',
        "",
        html,
    )
    html = re.sub(
        r'<script src="\./assets/echarts\.min\.js(?:\?[^"]*)?" defer></script>\s*',
        "",
        html,
    )
    html = re.sub(
        r'<script src="\./assets/app\.js(?:\?[^"]*)?" defer></script>\s*',
        "",
        html,
    )
    html = html.replace(
        "<title>供应雷达 · 供应链决策工作台</title>",
        "<title>供应雷达 · 分享讨论版</title>",
    )
    html = html.replace(
        "</head>",
        '  <meta name="robots" content="noindex,nofollow">\n</head>',
    )

    data_js = safe_script(json.dumps(data, ensure_ascii=False, separators=(",", ":")))
    geo_js = safe_script(json.dumps(geo, ensure_ascii=False, separators=(",", ":")))
    inject = f"""
<script>window.__SHARE_BUILD__=true;window.__DASHBOARD_DATA__={data_js};window.__CHINA_GEO__={geo_js};</script>
<script>{safe_script(china_map_geo)}</script>
<script>{safe_script(supplier_map)}</script>
<script>{safe_script(echarts)}</script>
<script>{safe_script(app)}</script>
"""
    # Inline SVG map has its own complete geometry in china-map-geo.js.
    # Keep the legacy GeoJSON injection for other ECharts-based views.
    html = html.replace("</body>", inject + "\n</body>")
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(html, encoding="utf-8")
    print(f"built: {OUTPUT}")
    print(f"size: {OUTPUT.stat().st_size / 1024 / 1024:.2f} MB")
    print(f"mode: {data.get('meta', {}).get('mode')}")
    print(f"materials: {len(data.get('supply', {}).get('materials', []))}")
    print(f"actions: {len(data.get('supply', {}).get('actions', []))}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())