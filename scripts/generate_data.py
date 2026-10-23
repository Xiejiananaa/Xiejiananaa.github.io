# -*- coding: utf-8 -*-
"""供应雷达平台数据生成器。

Codex 负责本地计算，WorkBuddy 负责外部行情、定时执行和发布，前端只读取 JSON。

输入优先级：
1. --input
2. SUPPLY_INPUT
3. data/inventory_report_test.xlsx
4. data/供应雷达-本地版_自动_总表18.xlsx
5. 相邻项目的总表18
6. data/*总表*.xlsx 最新文件

输出：data/dashboard_data.json
"""
from __future__ import annotations

import argparse
import glob
import json
import logging
import math
import os
import re
import sys
import tempfile
from collections import Counter, defaultdict
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any, Optional

try:
    import openpyxl
except ImportError as exc:  # pragma: no cover
    raise SystemExit("缺少 openpyxl，请先执行: python -m pip install -r requirements.txt") from exc

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"
DEFAULT_OUTPUT = DATA_DIR / "dashboard_data.json"
DEFAULT_EXTERNAL = DATA_DIR / "external_market.json"
REGION_CSV = ROOT / "assets" / "供应商地域映射.csv"

sys.path.insert(0, str(Path(__file__).resolve().parent))
from supplier_region import SupplierRegion  # noqa: E402

CONTRACT_VERSION = "2.1"
MODEL_VERSION = "supply-platform-v2.1"
LOG = logging.getLogger("generate_data")
COMPETITION_EXCLUDED_PLANTS = {"1160"}
INTERNAL_OUTPUT = DATA_DIR / "internal" / "dashboard_data.json"

RISK_CRITICAL = "🔴紧急"
RISK_WATCH = "🟡关注"


class WorkbookReader:
    def __init__(self, path: Path):
        self.path = Path(path)
        self.wb = openpyxl.load_workbook(self.path, read_only=True, data_only=True)
        self.sheetnames = list(self.wb.sheetnames)

    def rows(self, name: str, required: bool = False) -> list[dict[str, Any]]:
        if name not in self.sheetnames:
            if required:
                raise KeyError(f"工作簿缺少必需 Sheet: {name}")
            return []
        ws = self.wb[name]
        iterator = ws.iter_rows(values_only=True)
        try:
            header = [_text(x) for x in next(iterator)]
        except StopIteration:
            return []
        result = []
        for raw in iterator:
            if raw is None or all(x is None or _text(x) == "" for x in raw):
                continue
            row = {}
            for i, value in enumerate(raw):
                if i < len(header) and header[i]:
                    row[header[i]] = value
            result.append(row)
        return result

    def close(self) -> None:
        try:
            self.wb.close()
        except Exception:
            pass


def _text(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, datetime):
        return value.isoformat(sep=" ")
    if isinstance(value, date):
        return value.isoformat()
    return str(value).strip()


def _num(value: Any, default: float = 0.0) -> float:
    if value is None or value == "":
        return default
    if isinstance(value, bool):
        return float(value)
    if isinstance(value, (int, float)):
        return float(value)
    text = str(value).replace(",", "").replace("%", "").strip()
    try:
        return float(text)
    except (TypeError, ValueError):
        return default


def _optional_num(value: Any) -> Optional[float]:
    if value is None or value == "":
        return None
    number = _num(value, float("nan"))
    return None if math.isnan(number) else number


def _int(value: Any, default: int = 0) -> int:
    return int(round(_num(value, default)))


def _round(value: Optional[float], digits: int = 2) -> Optional[float]:
    if value is None or math.isnan(value) or math.isinf(value):
        return None
    return round(float(value), digits)


def _pct(value: Any) -> Optional[float]:
    if value is None or value == "":
        return None
    text = str(value).strip()
    number = _optional_num(value)
    if number is None:
        return None
    if "%" not in text and abs(number) <= 1.0:
        number *= 100.0
    return round(number, 2)


def _iso(value: Any) -> str:
    if isinstance(value, datetime):
        return value.date().isoformat()
    if isinstance(value, date):
        return value.isoformat()
    text = _text(value)
    match = re.match(r"^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})", text)
    if match:
        return f"{match.group(1)}-{int(match.group(2)):02d}-{int(match.group(3)):02d}"
    return text


def _date(value: Any) -> Optional[date]:
    text = _iso(value)
    if not text:
        return None
    try:
        return date.fromisoformat(text)
    except ValueError:
        return None


def _key(material: Any, plant: Any) -> str:
    return f"{_text(material)}|{_text(plant)}"


def _grade_letter(value: Any) -> str:
    match = re.match(r"^([A-E])", _text(value), flags=re.I)
    return match.group(1).upper() if match else ""


def _json_safe(value: Any) -> Any:
    if isinstance(value, (datetime, date)):
        return _iso(value)
    if isinstance(value, float) and (math.isnan(value) or math.isinf(value)):
        return None
    if isinstance(value, dict):
        return {str(k): _json_safe(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [_json_safe(v) for v in value]
    return value


def resolve_input(explicit: Optional[str], mode: str) -> tuple[Path, list[str]]:
    warnings = []
    if explicit:
        candidate = Path(explicit).expanduser().resolve()
        if not candidate.is_file():
            raise FileNotFoundError(f"输入文件不存在: {candidate}")
        return candidate, warnings

    env_value = os.environ.get("SUPPLY_INPUT", "").strip()
    if env_value:
        candidate = Path(env_value).expanduser().resolve()
        if candidate.is_file():
            return candidate, warnings
        warnings.append(f"SUPPLY_INPUT 指向的文件不存在: {candidate}")

    runtime_dir = Path(os.environ.get("SAPRADAR_OUTPUT_DIR") or (Path(tempfile.gettempdir()) / "SAPRadar_outputs"))
    if mode == "competition":
        runtime_matches = sorted(
            runtime_dir.joinpath("desensitized").glob("供应雷达-本地版_脱敏_部分_*.xlsx"),
            key=lambda p: p.stat().st_mtime,
            reverse=True,
        ) if runtime_dir.joinpath("desensitized").is_dir() else []
        partial_candidates = runtime_matches + [
            DATA_DIR / "供应雷达-本地版_脱敏_部分_20261019_总表18.xlsx",
            ROOT.parent / "供应雷达" / "data" / "desensitized" / "供应雷达-本地版_脱敏_部分_20261019_总表18.xlsx",
            DATA_DIR / "inventory_report_test.xlsx",
        ]
        partial_matches = sorted(
            [Path(p) for p in glob.glob(str(DATA_DIR / "供应雷达-本地版_脱敏_部分_*.xlsx"))],
            key=lambda p: p.stat().st_mtime,
            reverse=True,
        )
        for candidate in partial_matches + partial_candidates:
            if candidate.is_file():
                warnings.append(f"比赛模式使用部分脱敏工作簿: {candidate.name}")
                return candidate.resolve(), warnings
        raise FileNotFoundError(
            "比赛模式未找到部分脱敏工作簿。请放置 "
            "data/供应雷达-本地版_脱敏_部分_*.xlsx，或使用 --input 明确指定。"
        )

    candidates = [
        runtime_dir / "translated" / "供应雷达-本地版_自动.xlsx",
        DATA_DIR / "inventory_report_test.xlsx",
        DATA_DIR / "供应雷达-本地版_自动_总表18.xlsx",
        ROOT.parent / "供应雷达_页面设计" / "data" / "供应雷达-本地版_自动_总表18.xlsx",
        ROOT.parent / "供应雷达" / "data" / "translated" / "供应雷达-本地版_自动_总表18.xlsx",
    ]
    for candidate in candidates:
        if candidate.is_file():
            if candidate.name != "inventory_report_test.xlsx":
                warnings.append(f"内部模式未找到 inventory_report_test.xlsx，已回退使用: {candidate.name}")
            return candidate.resolve(), warnings

    matches = sorted(
        [Path(p) for p in glob.glob(str(DATA_DIR / "*总表*.xlsx"))],
        key=lambda p: p.stat().st_mtime,
        reverse=True,
    )
    if matches:
        warnings.append(f"内部模式未找到标准输入，已使用目录内最新总表: {matches[0].name}")
        return matches[0].resolve(), warnings

    raise FileNotFoundError("未找到输入 Excel。请放置 data/inventory_report_test.xlsx，或用 --input 指定路径。")


def load_external_market(path: Path) -> dict[str, Any]:
    result = {
        "available": False,
        "status": "missing",
        "updated_at": "",
        "items": [],
        "summary": {},
        "note": "external_market.json 不存在，行情板块将显示空状态。",
    }
    if not path.is_file():
        return result
    try:
        raw = json.loads(path.read_text(encoding="utf-8-sig"))
    except Exception as exc:
        result.update({"status": "invalid", "note": f"external_market.json 解析失败: {exc}"})
        return result

    items_raw = []
    if isinstance(raw, list):
        items_raw = raw
    elif isinstance(raw, dict):
        for key in ("items", "commodities", "markets", "data"):
            if isinstance(raw.get(key), list):
                items_raw = raw[key]
                break
        if not items_raw and any(k in raw for k in ("name", "名称", "commodity")):
            items_raw = [raw]
        result["updated_at"] = _iso(raw.get("updated_at") or raw.get("date") or raw.get("日期"))
        if raw.get("note"):
            result["note"] = _text(raw["note"])

    items = []
    for row in items_raw:
        if not isinstance(row, dict):
            continue
        name = _text(row.get("name") or row.get("名称") or row.get("commodity") or row.get("品种"))
        if not name:
            continue
        change_pct = None
        for field in ("change_pct", "change_percent", "pct_change", "涨跌幅", "change_rate"):
            if field in row:
                change_pct = _pct(row.get(field))
                break
        items.append({
            "name": name,
            "category": _text(row.get("category") or row.get("类别") or row.get("板块")),
            "price": _optional_num(row.get("price") if "price" in row else row.get("价格")),
            "unit": _text(row.get("unit") or row.get("单位")),
            "change_pct": change_pct,
            "change": _optional_num(row.get("change") if "change" in row else row.get("涨跌")),
            "date": _iso(row.get("date") or row.get("日期") or row.get("updated_at")),
            "source": _text(row.get("source") or row.get("来源")),
            "url": _text(row.get("url") or row.get("链接")),
            "summary": _text(row.get("summary") or row.get("摘要")),
        })

    changes = [x["change_pct"] for x in items if x["change_pct"] is not None]
    rising = sum(1 for x in changes if x > 0)
    falling = sum(1 for x in changes if x < 0)
    strong_rising = sum(1 for x in changes if x >= 5)
    pressure_ratio = strong_rising / len(changes) if changes else 0.0
    movers = sorted([x for x in items if x["change_pct"] is not None], key=lambda x: abs(x["change_pct"]), reverse=True)[:10]
    result.update({
        "available": bool(items),
        "status": "ok" if items else "empty",
        "items": items,
        "summary": {
            "item_count": len(items),
            "with_change_count": len(changes),
            "rising_count": rising,
            "falling_count": falling,
            "strong_rising_count": strong_rising,
            "pressure_ratio": round(pressure_ratio, 4),
            "avg_change_pct": round(sum(changes) / len(changes), 2) if changes else None,
            "top_movers": movers,
        },
        "note": "" if items else "external_market.json 已读取，但没有可识别的行情条目。",
    })
    return result


def warning_status(row: dict[str, Any], dynamic_days: Optional[float]) -> str:
    available = _num(row.get("available"))
    safety = _num(row.get("safety_stock"))
    avg_daily = _num(row.get("avg_daily"))
    reorder = _num(row.get("reorder_point"))
    risk_level = _text(row.get("risk_level"))
    incoming = _num(row.get("incoming"))
    if avg_daily <= 0:
        return "NO_DEMAND"
    if risk_level == RISK_CRITICAL or (safety > 0 and available < safety):
        return "CRITICAL"
    if dynamic_days is not None and dynamic_days < 7:
        return "CRITICAL"
    if risk_level == RISK_WATCH or (reorder > 0 and available + incoming < reorder):
        return "WATCH"
    if dynamic_days is not None and dynamic_days < 30:
        return "WATCH"
    return "NORMAL"


def material_health(row: dict[str, Any], dynamic_days: Optional[float]) -> Optional[int]:
    if _num(row.get("avg_daily")) <= 0:
        return None
    score = 100
    risk_level = _text(row.get("risk_level"))
    if risk_level == RISK_CRITICAL:
        score -= 25
    elif risk_level == RISK_WATCH:
        score -= 10
    safety = _num(row.get("safety_stock"))
    if safety > 0 and _num(row.get("available")) < safety:
        score -= 15
    if dynamic_days is not None and dynamic_days < 7:
        score -= 15
    supplier_rate = row.get("supplier_on_time_rate")
    if supplier_rate is not None and _num(supplier_rate) < 90:
        score -= 10
    if _num(row.get("overdue_qty")) > 0:
        score -= 10
    if "delta_gt_50" in row.get("review_reasons", []):
        score -= 5
    return max(0, min(100, int(round(score))))


def parse_review_reasons(note: Any) -> list[str]:
    text = _text(note)
    if not text:
        return []
    reasons = []
    if "样本不足" in text or "置信度低" in text:
        reasons.append("low_confidence")
    if "超过50%" in text or "超过 50%" in text:
        reasons.append("delta_gt_50")
    if "新增补货建议" in text:
        reasons.append("new_recommendation")
    if "无消耗" in text:
        reasons.append("no_demand")
    if "逾期" in text:
        reasons.append("overdue")
    return reasons or ["other"]


def decision_bucket(order_date: Optional[date], today: date) -> str:
    if order_date is None:
        return "unscheduled"
    if order_date < today:
        return "overdue"
    if order_date == today:
        return "due_today"
    if order_date <= today + timedelta(days=7):
        return "due_7d"
    return "later"


def normalize_material(row: dict[str, Any], today: date) -> dict[str, Any]:
    avg_daily = _num(row.get("平均日销量"))
    p95_daily = _num(row.get("P95日销量"))
    avg_lead = _num(row.get("平均到货天数"))
    p95_lead = _num(row.get("P95到货天数"))
    available = _num(row.get("当前可用库存"))
    incoming = _num(row.get("在途库存(不含逾期)") or row.get("未来到货量"))
    overdue_qty = _num(row.get("逾期未交量"))
    old_qty = _num(row.get("建议补单量"))
    has_demand = avg_daily > 0
    buffer_qty = max(0.0, p95_daily * p95_lead - avg_daily * avg_lead) if has_demand else 0.0
    safety_stock = buffer_qty
    reorder_point = avg_daily * avg_lead + buffer_qty if has_demand else 0.0
    new_qty = max(0.0, math.ceil(reorder_point - available - incoming)) if has_demand else 0.0
    reference_qty = max(0.0, math.ceil(reorder_point - available - incoming - overdue_qty)) if has_demand else 0.0
    source_new_qty = _optional_num(row.get("建议补货量(新)"))
    delta = new_qty - old_qty
    delta_pct = round(delta / old_qty * 100, 1) if old_qty > 0 else None
    dynamic_days = round(max(0.0, available + incoming) / avg_daily, 2) if has_demand else None
    atp_commit = max(0.0, available + incoming - safety_stock)
    atp_onhand = max(0.0, available - safety_stock)
    review_reasons = parse_review_reasons(row.get("复核提示"))
    order_date = _date(row.get("建议最晚下单日"))
    result = {
        "key": _key(row.get("物料编码"), row.get("工厂")),
        "material": _text(row.get("物料编码")),
        "description": _text(row.get("物料描述")),
        "plant": _text(row.get("工厂")),
        "product_group": _text(row.get("物料组")),
        "activity": _text(row.get("物料活性状态")),
        "supplier": _text(row.get("主供应商")),
        "supplier_on_time_rate": _pct(row.get("供应商准时率")),
        "factory_basis": _text(row.get("工厂归属依据")),
        "risk_level": _text(row.get("风险等级")),
        "risk_score": _optional_num(row.get("风险分")),
        "grade": _text(row.get("评分等级")),
        "grade_letter": _grade_letter(row.get("评分等级")),
        "risk_reason": _text(row.get("风险原因")),
        "action_text": _text(row.get("建议动作")),
        "available": _round(available),
        "incoming": _round(incoming),
        "overdue_qty": _round(_num(row.get("逾期未交量"))),
        "inventory_amount": _round(_num(row.get("库存金额"))),
        "monthly_use": _round(_num(row.get("月均消耗量"))),
        "avg_daily": _round(avg_daily, 4),
        "p95_daily": _round(p95_daily, 4),
        "demand_samples": _int(row.get("日销量样本数")),
        "avg_lead_days": _round(avg_lead),
        "p95_lead_days": _round(p95_lead),
        "lead_samples": _int(row.get("到货天数样本数")),
        "lead_source": _text(row.get("到货天数来源")),
        "buffer_qty": _round(buffer_qty),
        "safety_stock": _round(safety_stock),
        "reorder_point": _round(reorder_point),
        "safety_days": _round(buffer_qty / avg_daily, 2) if has_demand else 0.0,
        "dynamic_inventory_days": dynamic_days,
        "coverage_days": _round(_num(row.get("当前可覆盖天数"))),
        "theory_days_with_incoming": _round(_num(row.get("理论可用天数(含到货)"))),
        "atp_commit_qty": _round(atp_commit),
        "atp_onhand_qty": _round(atp_onhand),
        "atp_days": _round(atp_commit / avg_daily, 2) if avg_daily > 0 else None,
        "old_order_qty": _round(old_qty),
        "suggested_replenishment": _round(new_qty),
        "replenishment_delta": _round(delta),
        "replenishment_delta_pct": _round(delta_pct, 1),
        "reference_replenishment_with_overdue": _round(reference_qty),
        "confidence": _text(row.get("补货数据置信度")),
        "review_note": _text(row.get("复核提示")),
        "review_reasons": review_reasons,
        "calculation_source": "recomputed_A_P95",
        "source_new_qty": _round(source_new_qty),
        "formula_consistent": source_new_qty is None or abs(source_new_qty - new_qty) <= 1.0,
        "must_order_by": order_date.isoformat() if order_date else "",
        "decision_bucket": decision_bucket(order_date, today),
        "warning_status": "",
        "health_index": None,
    }
    result["warning_status"] = warning_status(result, dynamic_days)
    result["health_index"] = material_health(result, dynamic_days)
    return result


def normalize_action(row: dict[str, Any], risk_index: dict[str, dict[str, Any]], today: date) -> dict[str, Any]:
    key = _key(row.get("物料编码"), row.get("工厂"))
    risk = risk_index.get(key, {})
    merged = dict(risk)
    merged.update({k: v for k, v in row.items() if v not in (None, "")})
    for field in ("评分等级", "风险分", "日销量样本数", "到货天数样本数", "在途库存(不含逾期)", "补货量差异率(%)"):
        if merged.get(field) in (None, "") and risk.get(field) not in (None, ""):
            merged[field] = risk[field]
    item = normalize_material(merged, today)
    item["needs_review"] = item["decision_bucket"] == "unscheduled" or any(
        x in item["review_reasons"] for x in ("low_confidence", "delta_gt_50", "overdue", "other")
    )
    item["has_review_note"] = bool(item["review_note"])
    return item


def _quantile(values, p):
    vals = sorted(float(x) for x in values if x is not None and not math.isnan(float(x)))
    if not vals:
        return None
    if len(vals) == 1:
        return vals[0]
    k = (len(vals) - 1) * p
    lo, hi = int(math.floor(k)), int(math.ceil(k))
    if lo == hi:
        return vals[lo]
    return vals[lo] + (vals[hi] - vals[lo]) * (k - lo)


def _median(values):
    return _quantile(values, 0.5)


def build_suppliers_from_sheet(rows):
    suppliers = []
    for row in rows:
        suppliers.append({
            "name": _text(row.get("供应商")),
            "status": _text(row.get("数据状态")),
            "orders": _int(row.get("订单总数")),
            "arrived_orders": _int(row.get("已到货订单数")),
            "on_time_orders": _int(row.get("准时订单数")),
            "on_time_rate": _pct(row.get("准时到货率")),
            "avg_delay": _round(_num(row.get("平均首到延迟天数"))),
            "median_delay": _round(_num(row.get("中位首到延迟天数"))),
            "p80_delay": _round(_num(row.get("P80延迟天数"))),
            "p90_delay": _round(_num(row.get("P90延迟天数"))),
            "avg_lead": _round(_num(row.get("平均采购周期"))),
            "median_lead": _round(_num(row.get("中位采购周期"))),
            "split_orders": _int(row.get("分批到货订单数")),
            "split_rate": _pct(row.get("分批到货率")),
            "missing_receipts": _int(row.get("缺收货记录订单数")),
            "scope": "source_sheet",
        })
    return suppliers


def build_suppliers_from_mb51(rows, plant: str):
    grouped = defaultdict(list)
    for row in rows:
        if _text(row.get("工厂")) != plant:
            continue
        supplier = _text(row.get("供应商"))
        if supplier:
            grouped[supplier].append(row)
    suppliers = []
    for supplier, items in grouped.items():
        unique_orders = {}
        for row in items:
            key = (_text(row.get("采购订单")), _text(row.get("采购订单项目")), _text(row.get("物料编码")))
            unique_orders[key] = row
        orders = list(unique_orders.values())
        arrived = [r for r in orders if _date(r.get("实际首到日期"))]
        on_time = [r for r in arrived if _text(r.get("是否准时首到")) == "是"]
        delays = [_num(r.get("首到延迟天数"), float("nan")) for r in arrived]
        delays = [x for x in delays if not math.isnan(x)]
        leads = [_num(r.get("订单到首到周期"), float("nan")) for r in arrived]
        leads = [x for x in leads if not math.isnan(x)]
        full_leads = [_num(r.get("订单到完全到货周期"), float("nan")) for r in orders]
        full_leads = [x for x in full_leads if not math.isnan(x)]
        split = sum(1 for r in orders if _num(r.get("到货批次数")) > 1)
        missing = sum(1 for r in orders if _text(r.get("是否缺MB51收货")) == "是")
        on_time_rate = round(len(on_time) / len(arrived) * 100, 2) if arrived else None
        suppliers.append({
            "name": supplier,
            "status": "有效" if arrived else "缺收货数据",
            "orders": len(orders),
            "arrived_orders": len(arrived),
            "on_time_orders": len(on_time),
            "on_time_rate": on_time_rate,
            "avg_delay": _round(sum(delays) / len(delays)) if delays else None,
            "median_delay": _round(_median(delays)) if delays else None,
            "p80_delay": _round(_quantile(delays, 0.8)) if delays else None,
            "p90_delay": _round(_quantile(delays, 0.9)) if delays else None,
            "avg_lead": _round(sum(leads) / len(leads)) if leads else None,
            "median_lead": _round(_median(leads)) if leads else None,
            "split_orders": split,
            "split_rate": round(split / len(orders) * 100, 2) if orders else None,
            "missing_receipts": missing,
            "scope": f"mb51_plant_{plant}",
        })
    return suppliers


def enrich_suppliers(suppliers, materials):
    lookup = SupplierRegion(REGION_CSV)
    by_supplier = defaultdict(list)
    for material in materials:
        if material.get("supplier"):
            by_supplier[material["supplier"]].append(material)
    for supplier in suppliers:
        related = by_supplier.get(supplier["name"], [])
        region = lookup.classify(supplier["name"])
        groups = Counter(m.get("product_group") or "未分组" for m in related)
        supplier["region_province"] = region.get("province", "")
        supplier["region_city"] = region.get("city", "")
        supplier["related_material_count"] = len(related)
        supplier["critical_material_count"] = sum(1 for m in related if m.get("risk_level") == RISK_CRITICAL)
        supplier["watch_material_count"] = sum(1 for m in related if m.get("risk_level") == RISK_WATCH)
        supplier["product_groups"] = [
            {"name": name, "count": count}
            for name, count in groups.most_common(3)
        ]
        score = 100.0
        on_time = supplier.get("on_time_rate")
        if on_time is None:
            score -= 15
        else:
            score -= min(20.0, max(0.0, 95.0 - float(on_time)) * 0.8)
        score -= min(25.0, max(0.0, _num(supplier.get("median_delay"))) * 2.0)
        orders = max(1, int(supplier.get("orders") or 0))
        score -= min(20.0, _num(supplier.get("missing_receipts")) / orders * 40.0)
        score -= min(10.0, _num(supplier.get("split_rate")) * 0.15)
        if orders < 10:
            score -= 5.0
        score = round(max(0.0, min(100.0, score)), 1)
        supplier["delivery_health_score"] = score
        supplier["stars"] = max(1, min(5, int(round(score / 20.0))))
        supplier["risk_label"] = "低风险" if score >= 85 else "需关注" if score >= 65 else "高风险"
    return suppliers


def build_supplier_payload(suppliers):
    suppliers.sort(key=lambda x: (-(x["orders"] or 0), x["name"]))
    effective = [x for x in suppliers if x["status"] == "有效" and x["on_time_rate"] is not None]
    missing = [x for x in suppliers if x["status"] != "有效" or x["missing_receipts"] > 0]
    return {
        "total": len(suppliers),
        "effective_count": sum(1 for x in suppliers if x["status"] == "有效"),
        "missing_receipts_count": sum(1 for x in suppliers if x["status"] != "有效"),
        "top_on_time": sorted(effective, key=lambda x: (-(x["on_time_rate"] or 0), -(x["orders"] or 0)))[:10],
        "top_delay": sorted(effective, key=lambda x: (-(x["p90_delay"] or 0), -(x["median_delay"] or 0)))[:10],
        "missing_receipts": missing[:50],
        "items": suppliers,
    }


def build_purchase_orders(reader: WorkbookReader, today: date, mode: str, risk_index):
    rows = reader.rows("PO到货计划")
    if mode == "competition":
        rows = [r for r in rows if _text(r.get("工厂")) not in COMPETITION_EXCLUDED_PLANTS]
    items = []
    for row in rows:
        material = _text(row.get("物料编码"))
        plant = _text(row.get("工厂"))
        risk = risk_index.get(_key(material, plant), {})
        days_left = _int(row.get("剩余天数")) if row.get("剩余天数") not in (None, "") else None
        overdue_flag = _text(row.get("是否逾期")) == "是"
        if overdue_flag or (days_left is not None and days_left < 0):
            bucket = "overdue"
            alert = "red"
        elif days_left is not None and days_left <= 2:
            bucket = "due_2d"
            alert = "orange"
        elif days_left is not None and days_left <= 7:
            bucket = "due_7d"
            alert = "yellow"
        else:
            bucket = "future"
            alert = "normal"
        items.append({
            "po_no": _text(row.get("采购凭证")),
            "srm_po": _text(row.get("SRM采购订单")),
            "material": material,
            "description": _text(row.get("物料描述")),
            "material_group": _text(row.get("物料组")),
            "plant": plant,
            "storage_location": _text(row.get("库存地点")),
            "supplier_code": _text(row.get("供应商代码")),
            "supplier": _text(row.get("供应商名称")),
            "purchase_group": _text(row.get("采购组")),
            "order_date": _iso(row.get("凭证日期")),
            "delivery_date": _iso(row.get("交货日期")),
            "eta_date": _iso(row.get("预计到货日")),
            "days_left": days_left,
            "arrival_bucket": _text(row.get("到货区间")),
            "open_qty": _round(_num(row.get("仍要交货数量"))),
            "order_qty": _round(_num(row.get("采购订单数量"))),
            "overdue": overdue_flag or bucket == "overdue",
            "alert": alert,
            "decision_bucket": bucket,
            "matched_risk": bool(risk),
            "risk_level": _text(risk.get("风险等级")),
            "grade": _text(risk.get("评分等级")),
            "supplier_on_time_rate": _pct(risk.get("供应商准时率")),
        })
    order = {"overdue": 0, "due_2d": 1, "due_7d": 2, "future": 3}
    items.sort(key=lambda x: (order.get(x["decision_bucket"], 9), x["days_left"] if x["days_left"] is not None else 99999, x["po_no"]))
    summary = {
        "total": len(items),
        "overdue": sum(1 for x in items if x["decision_bucket"] == "overdue"),
        "due_2d": sum(1 for x in items if x["decision_bucket"] == "due_2d"),
        "due_7d": sum(1 for x in items if x["decision_bucket"] == "due_7d"),
        "future": sum(1 for x in items if x["decision_bucket"] == "future"),
        "unmatched_risk": sum(1 for x in items if not x["matched_risk"]),
        "open_qty": round(sum((x.get("open_qty") or 0) for x in items), 2),
    }
    return {"summary": summary, "items": items}


def build_supply(reader: WorkbookReader, today: date, mode: str):
    risk_rows = reader.rows("供应风险总表", required=True)
    action_rows = reader.rows("采购断料行动清单", required=True)
    if mode == "competition":
        risk_rows = [r for r in risk_rows if _text(r.get("工厂")) not in COMPETITION_EXCLUDED_PLANTS and _num(r.get("月均消耗量")) > 0]
        action_rows = [r for r in action_rows if _text(r.get("工厂")) not in COMPETITION_EXCLUDED_PLANTS and _num(r.get("月均消耗量")) > 0]
        suppliers = build_suppliers_from_mb51(reader.rows("MB51实际收货"), "1501")
        arrival_rows = [r for r in reader.rows("到货节奏") if _text(r.get("工厂")) not in COMPETITION_EXCLUDED_PLANTS]
    else:
        suppliers = build_suppliers_from_sheet(reader.rows("供应商交付绩效", required=True))
        arrival_rows = reader.rows("到货节奏")

    risk_index = {_key(r.get("物料编码"), r.get("工厂")): r for r in risk_rows}
    materials = [normalize_material(r, today) for r in risk_rows]
    actions = [normalize_action(r, risk_index, today) for r in action_rows]
    bucket_order = {"overdue": 0, "due_today": 1, "due_7d": 2, "unscheduled": 3, "later": 4}
    actions.sort(key=lambda x: (bucket_order.get(x["decision_bucket"], 9), x["must_order_by"] or "9999-12-31", -(x.get("replenishment_delta") or 0), x["material"]))

    enrich_suppliers(suppliers, materials)
    supplier_payload = build_supplier_payload(suppliers)
    geo = build_geo(suppliers)
    rhythm = build_arrival_rhythm(arrival_rows, today)
    purchase_orders = build_purchase_orders(reader, today, mode, risk_index)
    return {
        "materials": materials,
        "actions": actions,
        "suppliers": supplier_payload,
        "geo": geo,
        "arrival_rhythm": rhythm,
        "purchase_orders": purchase_orders,
    }, materials, actions, geo

def build_geo(suppliers: list[dict[str, Any]]) -> dict[str, Any]:
    lookup = SupplierRegion(REGION_CSV)
    provinces = {}
    cities = {}
    unlocated = []
    located = 0
    for supplier in suppliers:
        info = lookup.classify(supplier["name"])
        if info["level"] == "unknown":
            unlocated.append({"name": supplier["name"], "orders": supplier["orders"], "missing_receipts": supplier["missing_receipts"]})
            continue
        located += 1
        province = info["province"]
        city = info["city"] or province
        p = provinces.setdefault(province, {"name": province, "supplier_count": 0, "orders": 0, "missing_receipts": 0, "lat": info["lat"], "lon": info["lon"]})
        p["supplier_count"] += 1
        p["orders"] += supplier["orders"] or 0
        p["missing_receipts"] += supplier["missing_receipts"] or 0
        if info["level"] == "city":
            c = cities.setdefault(city, {"name": city, "province": province, "supplier_count": 0, "orders": 0, "missing_receipts": 0, "lat": info["lat"], "lon": info["lon"]})
            c["supplier_count"] += 1
            c["orders"] += supplier["orders"] or 0
            c["missing_receipts"] += supplier["missing_receipts"] or 0
    return {
        "total": len(suppliers), "located": located, "unlocated_count": len(unlocated), "unlocated": unlocated,
        "provinces": sorted(provinces.values(), key=lambda x: (-x["supplier_count"], x["name"])),
        "cities": sorted(cities.values(), key=lambda x: (-x["supplier_count"], x["name"])),
        "method": "按供应商名称中的行政区划匹配；未命中不猜测。",
    }


def build_arrival_rhythm(rows: list[dict[str, Any]], today: date) -> dict[str, Any]:
    buckets = defaultdict(lambda: {"date": "", "qty": 0.0, "orders": 0, "overdue": 0})
    for row in rows:
        d = _date(row.get("到货日期"))
        if not d:
            continue
        bucket = buckets[d.isoformat()]
        bucket["date"] = d.isoformat()
        bucket["qty"] += _num(row.get("到货数量"))
        bucket["orders"] += _int(row.get("订单数"))
        if _text(row.get("是否逾期")) == "是":
            bucket["overdue"] += 1
    items = sorted(buckets.values(), key=lambda x: x["date"])
    future = [x for x in items if x["date"] >= today.isoformat()]
    return {"available": bool(items), "total_qty": round(sum(x["qty"] for x in items), 2), "future_qty": round(sum(x["qty"] for x in future), 2), "buckets": items}


def build_warehouse(reader: WorkbookReader, today: date, mode: str) -> dict[str, Any]:
    rows = reader.rows("库存明细")
    if mode == "competition":
        rows = [r for r in rows if _text(r.get("工厂")) not in COMPETITION_EXCLUDED_PLANTS]
    if not rows:
        return {"available": False, "note": "库存明细不存在，仓储板块仅显示空状态。", "summary": {}, "plants": [], "locations": [], "aging": []}
    plant_stats = {}
    location_stats = {}
    aging = Counter({"0-30天": 0, "31-90天": 0, "91-180天": 0, "181-365天": 0, ">365天": 0})
    skus = set()
    total_amount = total_available = line_side = returns = oldest = 0.0
    for row in rows:
        plant = _text(row.get("工厂"))
        location = _text(row.get("库存地点"))
        location_name = _text(row.get("库存地点名称"))
        sku = _text(row.get("物料"))
        skus.add(f"{sku}|{plant}")
        amount = _num(row.get("金额(元)"))
        available = _num(row.get("可用库存(kg)"))
        line = _num(row.get("线边仓库存(kg)"))
        ret = _num(row.get("退货仓库存(kg)"))
        age = _num(row.get("库龄"))
        total_amount += amount
        total_available += available
        line_side += line
        returns += ret
        oldest = max(oldest, age)
        if age <= 30:
            aging["0-30天"] += 1
        elif age <= 90:
            aging["31-90天"] += 1
        elif age <= 180:
            aging["91-180天"] += 1
        elif age <= 365:
            aging["181-365天"] += 1
        else:
            aging[">365天"] += 1
        p = plant_stats.setdefault(plant, {"plant": plant, "plant_name": _text(row.get("工厂名称")), "batch_rows": 0, "skus": set(), "available_qty": 0.0, "inventory_amount": 0.0, "line_side_qty": 0.0, "return_qty": 0.0, "oldest_age_days": 0.0})
        p["batch_rows"] += 1
        p["skus"].add(sku)
        p["available_qty"] += available
        p["inventory_amount"] += amount
        p["line_side_qty"] += line
        p["return_qty"] += ret
        p["oldest_age_days"] = max(p["oldest_age_days"], age)
        loc = location_stats.setdefault(f"{plant}|{location}", {"plant": plant, "location": location, "location_name": location_name, "batch_rows": 0, "available_qty": 0.0, "inventory_amount": 0.0, "oldest_age_days": 0.0})
        loc["batch_rows"] += 1
        loc["available_qty"] += available
        loc["inventory_amount"] += amount
        loc["oldest_age_days"] = max(loc["oldest_age_days"], age)
    plants = []
    for p in plant_stats.values():
        p["sku_count"] = len(p.pop("skus"))
        for field in ("available_qty", "inventory_amount", "line_side_qty", "return_qty", "oldest_age_days"):
            p[field] = round(p[field], 2)
        plants.append(p)
    plants.sort(key=lambda x: (-x["inventory_amount"], x["plant"]))
    locations = sorted(location_stats.values(), key=lambda x: (-x["inventory_amount"], x["plant"]))[:30]
    for loc in locations:
        for field in ("available_qty", "inventory_amount", "oldest_age_days"):
            loc[field] = round(loc[field], 2)
    return {
        "available": True,
        "summary": {"batch_rows": len(rows), "sku_plant_count": len(skus), "available_qty": round(total_available, 2), "inventory_amount": round(total_amount, 2), "line_side_qty": round(line_side, 2), "return_qty": round(returns, 2), "oldest_age_days": round(oldest, 2), "quantity_unit": "kg", "quantity_unit_mixed": False},
        "plants": plants,
        "locations": locations,
        "aging": [{"bucket": k, "count": v} for k, v in aging.items()],
        "note": "源表库存数量按 kg 口径汇总；跨物料 kg 合计仅表示总重量，不代表金额或风险价值。",
    }


def build_production(materials: list[dict[str, Any]], actions: list[dict[str, Any]]) -> dict[str, Any]:
    active = [m for m in materials if (m.get("avg_daily") or 0) > 0]
    urgent = [m for m in active if m["risk_level"] == RISK_CRITICAL]
    watch = [m for m in active if m["risk_level"] == RISK_WATCH]
    plants = Counter(m["plant"] for m in urgent)
    top = sorted(active, key=lambda m: ({"CRITICAL": 0, "WATCH": 1, "NORMAL": 2}.get(m["warning_status"], 9), m.get("dynamic_inventory_days") if m.get("dynamic_inventory_days") is not None else 99999, -(m.get("risk_score") or 0)))[:30]
    return {
        "data_status": "derived_from_supply",
        "available": True,
        "missing_sources": ["生产计划", "生产工单", "成品库存"],
        "summary": {"plant_count": len({m["plant"] for m in materials}), "active_material_count": len(active), "critical_material_count": len(urgent), "watch_material_count": len(watch), "stockout_within_7d_count": sum(1 for m in active if (m.get("dynamic_inventory_days") or 99999) < 7), "action_count": len(actions), "unscheduled_action_count": sum(1 for a in actions if a["decision_bucket"] == "unscheduled")},
        "plant_risks": [{"plant": plant, "critical_count": count} for plant, count in sorted(plants.items(), key=lambda x: (-x[1], x[0]))],
        "top_materials": top,
        "note": "生产板块当前由供应风险派生；生产计划/工单接入后应替换为真实排产保障数据。",
    }


def build_overview(materials, actions, suppliers, market, mode: str, exclusions: dict[str, Any]):
    active = [m for m in materials if (m.get("avg_daily") or 0) > 0]
    no_demand = len(materials) - len(active)
    critical = [m for m in materials if m["risk_level"] == RISK_CRITICAL]
    watch = [m for m in materials if m["risk_level"] == RISK_WATCH]
    b_plus = [m for m in materials if m["grade_letter"] in ("A", "B")]
    review = [a for a in actions if a["needs_review"]]
    flagged = [a for a in actions if a["has_review_note"]]
    confidence = Counter(m["confidence"] for m in active)
    action_confidence = Counter(a["confidence"] for a in actions)
    risk_dist = Counter(m["risk_level"] or "未标记" for m in materials)
    grade_dist = Counter(m["grade"] or "未评级" for m in materials)
    inventory_low = sum(1 for m in active if (m.get("safety_stock") or 0) > 0 and (m.get("available") or 0) < (m.get("safety_stock") or 0))
    stockout_7 = sum(1 for m in active if (m.get("dynamic_inventory_days") if m.get("dynamic_inventory_days") is not None else 99999) < 7)
    supplier_risk = sum(1 for m in active if m.get("supplier_on_time_rate") is None or (m.get("supplier_on_time_rate") or 0) < 90)
    overdue = sum(1 for m in active if (m.get("overdue_qty") or 0) > 0)
    market_pressure = (market.get("summary") or {}).get("pressure_ratio") or 0
    n = max(1, len(active))
    dimensions = {
        "inventory_low": {"count": inventory_low, "ratio": round(inventory_low / n, 4), "weight": 20, "penalty": round(inventory_low / n * 20, 2)},
        "stockout_7d": {"count": stockout_7, "ratio": round(stockout_7 / n, 4), "weight": 20, "penalty": round(stockout_7 / n * 20, 2)},
        "supplier_otif": {"count": supplier_risk, "ratio": round(supplier_risk / n, 4), "weight": 10, "penalty": round(supplier_risk / n * 10, 2)},
        "arrival_exception": {"count": overdue, "ratio": round(overdue / n, 4), "weight": 10, "penalty": round(overdue / n * 10, 2)},
        "cost_pressure": {"count": (market.get("summary") or {}).get("strong_rising_count", 0), "ratio": round(market_pressure, 4), "weight": 10, "penalty": round(market_pressure * 10, 2)},
    }
    score = round(max(0.0, min(100.0, 100.0 - sum(d["penalty"] for d in dimensions.values()))), 1)
    level = "健康" if score >= 80 else "关注" if score >= 60 else "风险"
    safety_total = sum((m.get("safety_stock") or 0) for m in active)
    new_total = sum((m.get("suggested_replenishment") or 0) for m in materials)
    old_total = sum((m.get("old_order_qty") or 0) for m in materials)
    action_new_total = sum((a.get("suggested_replenishment") or 0) for a in actions)

    def card(bucket):
        if bucket == "due_7d":
            items = [a for a in actions if a["decision_bucket"] in ("due_today", "due_7d")]
        else:
            items = [a for a in actions if a["decision_bucket"] == bucket]
        return {"count": len(items), "items": items[:8]}

    reason_counts = Counter()
    for a in actions:
        for reason in a["review_reasons"]:
            reason_counts[reason] += 1
    kpis = [
        {"id": "material_plant", "label": "物料/工厂", "value": len(materials), "unit": "项", "hint": "比赛版：仅 1501，已排除无消耗行" if mode == "competition" else f"活跃 {len(active)} · 无消耗 {no_demand}", "tone": "primary"},
        {"id": "critical", "label": "紧急物料", "value": len(critical), "unit": "项", "hint": "当前最高优先级", "tone": "danger"},
        {"id": "watch", "label": "关注物料", "value": len(watch), "unit": "项", "hint": "覆盖或到货偏紧", "tone": "warn"},
        {"id": "b_plus", "label": "B级以上", "value": len(b_plus), "unit": "项", "hint": "A/B 风险评分", "tone": "purple"},
        {"id": "safety_stock", "label": "安全库存", "value": round(safety_total, 2), "unit": "kg", "hint": f"有消耗物料 {len(active)} 项", "tone": "primary", "mixed_unit": False},
        {"id": "replenishment_new", "label": "新建议补货", "value": round(new_total, 2), "unit": "kg", "hint": f"旧口径 {round(old_total, 2):,.0f} kg · 行动清单 {round(action_new_total, 2):,.0f} kg", "tone": "warn", "mixed_unit": False},
        {"id": "review", "label": "待复核", "value": len(review), "unit": "项", "hint": f"全部复核提示 {len(flagged)} 项", "tone": "warn"},
        {"id": "suppliers", "label": "供应商", "value": suppliers.get("total", 0), "unit": "家", "hint": f"有效 {suppliers.get('effective_count', 0)} · 缺收货订单 {sum((x.get('missing_receipts') or 0) for x in suppliers.get('items', []))}", "tone": "ok"},
    ]
    return {
        "health": {"score": score, "level": level, "formula": "100 - 库存偏低比例×20 - 7天断供比例×20 - 供应商OTIF异常比例×10 - 到货异常比例×10 - 成本压力比例×10", "active_material_count": len(active), "dimensions": dimensions},
        "kpis": kpis,
        "decision_cards": {"overdue": card("overdue"), "due_7d": card("due_7d"), "review": {"count": len(review), "reason_counts": dict(reason_counts), "items": review[:8]}, "unscheduled": card("unscheduled")},
        "distributions": {"risk": [{"name": k, "value": v} for k, v in risk_dist.most_common()], "grade": [{"name": k, "value": v} for k, v in grade_dist.most_common()], "confidence_active": [{"name": k, "value": v} for k, v in confidence.most_common()], "confidence_action": [{"name": k, "value": v} for k, v in action_confidence.most_common()]},
        "scope": {"mode": mode, "plant_scope": "1501" if mode == "competition" else "all", "exclusions": exclusions},
        "summary_text": f"监控 {len(materials)} 个物料/工厂组合，{len(critical)} 项紧急、{len(watch)} 项关注；{len(review)} 项待复核。",
        "quantity_note": "源表数量按 kg 口径汇总；跨物料 kg 合计表示总重量，不代表金额、价值或物料间可直接比较。",
    }


def build_data_quality(reader, materials, actions, mode: str, exclusions: dict[str, Any]):
    if mode == "competition":
        mb51 = [r for r in reader.rows("MB51实际收货") if _text(r.get("工厂")) == "1501"]
        arrived = [r for r in mb51 if _date(r.get("实际首到日期"))]
        missing = sum(1 for r in mb51 if _text(r.get("是否缺MB51收货")) == "是")
        partial = sum(1 for r in mb51 if _text(r.get("到货状态")) == "部分到货")
        suppliers = {_text(r.get("供应商")) for r in mb51 if _text(r.get("供应商"))}
        items = [
            {"item": "比赛版风险物料数", "count": len(materials), "note": "仅工厂1501，已排除无消耗行"},
            {"item": "比赛版采购行动数", "count": len(actions), "note": "仅工厂1501"},
            {"item": "比赛版已排除无消耗行", "count": exclusions.get("no_demand_rows", 0), "note": "不会进入比赛页面"},
            {"item": "比赛版已排除历史工厂行", "count": exclusions.get("excluded_legacy_plant_rows", 0), "note": "仅内部版保留"},
            {"item": "工厂1501 MB51订单行", "count": len(mb51), "note": "供应商绩效按1501重算"},
            {"item": "工厂1501已到货订单行", "count": len(arrived), "note": ""},
            {"item": "工厂1501部分到货行", "count": partial, "note": ""},
            {"item": "工厂1501缺MB51收货行", "count": missing, "note": "需人工核查"},
            {"item": "工厂1501相关供应商数", "count": len(suppliers), "note": "部分脱敏后的供应商名称口径"},
        ]
        return {
            "items": items,
            "verdict": "比赛版仅展示工厂1501；无消耗和历史工厂数据未推送",
            "derived": {
                "no_demand_count": 0,
                "hidden_no_demand_count": exclusions.get("no_demand_rows", 0),
                "low_confidence_count": sum(1 for m in materials if m.get("confidence") == "低"),
                "action_count": len(actions),
                "unscheduled_action_count": sum(1 for a in actions if a["decision_bucket"] == "unscheduled"),
                "review_item_count": sum(1 for a in actions if a["needs_review"]),
                "review_note_count": sum(1 for a in actions if a["has_review_note"]),
                "missing_mb51_receipts": missing,
                "excluded_legacy_plant_rows": exclusions.get("excluded_legacy_plant_rows", 0),
            },
        }

    rows = reader.rows("数据质量检查", required=True)
    items = [{"item": _text(r.get("检查项")), "count": _int(r.get("数量")), "note": _text(r.get("说明"))} for r in rows if _text(r.get("检查项"))]
    detail = {x["item"]: x["count"] for x in items}
    return {
        "items": items,
        "verdict": "存在需人工核查的数据质量问题",
        "derived": {
            "no_demand_count": sum(1 for m in materials if (m.get("avg_daily") or 0) <= 0),
            "low_confidence_count": sum(1 for m in materials if m.get("confidence") == "低"),
            "action_count": len(actions),
            "unscheduled_action_count": sum(1 for a in actions if a["decision_bucket"] == "unscheduled"),
            "review_item_count": sum(1 for a in actions if a["needs_review"]),
            "review_note_count": sum(1 for a in actions if a["has_review_note"]),
            "unmatched_overdue_po": detail.get("ME2L逾期PO未匹配风险表行数"),
            "unmatched_future_po": detail.get("ME2L未来PO未匹配风险表行数"),
            "missing_mb51_receipts": detail.get("已关闭但MB51缺收货行数"),
        },
    }

def build_provenance(input_path: Path, external_path: Path, mode: str):
    return {
        "model_version": MODEL_VERSION,
        "input_file": input_path.name,
        "external_market_file": external_path.name if external_path.is_file() else "",
        "visibility": {"mode": mode, "competition": "部分脱敏 + 仅工厂1501 + 排除无消耗", "internal": "本地真实数据 + 全部工厂 + 保留无消耗"}.get(mode, mode),
        "sources": {"supply_risk": "供应风险总表", "action_list": "采购断料行动清单", "supplier_performance": "供应商交付绩效" if mode == "internal" else "MB51实际收货（按工厂1501重算）", "warehouse": "库存明细", "arrival": "到货节奏", "quality": "数据质量检查" if mode == "internal" else "MB51实际收货 + 过滤结果", "market": "data/external_market.json（可选）"},
        "formulas": [
            {"field": "动态库存天数", "formula": "(当前可用库存 + 在途库存) / 平均日销量", "note": "平均日销量<=0时不计算"},
            {"field": "ATP承诺量", "formula": "max(0, 当前可用库存 + 在途库存 - 安全库存)", "note": "当前没有销售承诺/占用表，因此不扣减客户订单"},
            {"field": "ATP在库量", "formula": "max(0, 当前可用库存 - 安全库存)", "note": "不包含在途"},
            {"field": "缓冲量", "formula": "max(0, P95日销量 × P95到货天数 - 平均日销量 × 平均到货天数)", "note": "A口径"},
            {"field": "安全库存", "formula": "缓冲量", "note": "纯缓冲，不含提前期需求"},
            {"field": "再订货点", "formula": "平均日销量 × 平均到货天数 + 缓冲量", "note": ""},
            {"field": "建议补货量", "formula": "max(0, ceil(再订货点 - 当前可用库存 - 在途库存))", "note": "不包含逾期未交量"},
            {"field": "物料健康指数", "formula": "100 - 紧急25 - 关注10 - 低于安全库存15 - 7天内断供15 - 供应商OTIF异常10 - 逾期10 - 新旧差异>50%扣5", "note": "无消耗数据时不评分"},
            {"field": "全局健康指数", "formula": "100 - 库存偏低比例×20 - 7天断供比例×20 - 供应商OTIF异常比例×10 - 到货异常比例×10 - 成本压力比例×10", "note": "各比例为有消耗物料的占比"},
        ],
        "limitations": [
            "当前没有销售订单/产能占用数据，ATP为供应侧可承诺量，不是严格销售ATP。",
            "当前没有生产计划、工单和成品库存，生产板块由供应风险派生。",
            "源表数量按 kg 汇总；跨物料 kg 合计仅表示总重量，不代表金额或风险价值。",
            "无消耗数据的物料不计算安全库存、ATP和健康指数。",
            "比赛版排除历史工厂和无消耗数据；内部版保留全部数据。",
            "外部行情由WorkBuddy写入；文件不存在或结构不符时页面显示空状态。",
        ],
    }


def generate(input_path: Path, output_path: Path, external_path: Path, today: date, fallback_warnings: list[str], mode: str) -> dict[str, Any]:
    reader = WorkbookReader(input_path)
    try:
        all_risk = reader.rows("供应风险总表", required=True)
        all_actions = reader.rows("采购断料行动清单", required=True)
        exclusions = {
            "source_material_rows": len(all_risk),
            "source_action_rows": len(all_actions),
            "excluded_legacy_plant_rows": sum(1 for r in all_risk if _text(r.get("工厂")) in COMPETITION_EXCLUDED_PLANTS),
            "no_demand_rows": sum(1 for r in all_risk if _text(r.get("工厂")) not in COMPETITION_EXCLUDED_PLANTS and _num(r.get("月均消耗量")) <= 0),
            "no_demand_policy": "competition_excluded" if mode == "competition" else "internal_included",
            "legacy_plant_policy": "competition_excluded" if mode == "competition" else "internal_included",
        }
        supply, materials, actions, geo = build_supply(reader, today, mode)
        market = load_external_market(external_path)
        warehouse = build_warehouse(reader, today, mode)
        overview = build_overview(materials, actions, supply["suppliers"], market, mode, exclusions)
        quality = build_data_quality(reader, materials, actions, mode, exclusions)
        provenance = build_provenance(input_path, external_path, mode)
        warnings = list(fallback_warnings)
        if not external_path.is_file():
            warnings.append("external_market.json 不存在，行情板块将显示空状态。")
        if market.get("status") == "invalid":
            warnings.append(market.get("note", "external_market.json 无效"))
        if mode == "competition":
            warnings.append(f"比赛版已排除历史工厂行 {exclusions['excluded_legacy_plant_rows']} 条、无消耗行 {exclusions['no_demand_rows']} 条。")
        elif any(m["plant"] in COMPETITION_EXCLUDED_PLANTS for m in materials):
            warnings.append("内部版包含工厂1160；仅本地使用，不得发布到公开页面。")

        payload = {
            "meta": {
                "contract_version": CONTRACT_VERSION,
                "model_version": MODEL_VERSION,
                "generated_at": datetime.now().isoformat(timespec="seconds"),
                "as_of": today.isoformat(),
                "mode": mode,
                "visibility": "competition" if mode == "competition" else "internal",
                "desensitized": mode == "competition",
                "quantity_unit": "kg",
                "quantity_unit_note": "源表数量按kg口径；跨物料kg合计仅表示总重量。",
                "source_file": input_path.name,
                "source_sheets": reader.sheetnames,
                "exclusions": exclusions,
                "row_counts": {
                    "materials": len(materials),
                    "actions": len(actions),
                    "suppliers": len(supply["suppliers"].get("items", [])),
                    "warehouse_batches": (warehouse.get("summary") or {}).get("batch_rows", 0),
                },
                "warnings": warnings,
            },
            "overview": overview,
            "supply": {**supply, "external_market": market},
            "warehouse": warehouse,
            "data_quality": quality,
            "provenance": provenance,
        }
        if mode == "internal":
            payload["production"] = build_production(materials, actions)
        payload = _json_safe(payload)
        output_path.parent.mkdir(parents=True, exist_ok=True)
        # file:// pages cannot fetch local JSON. Keep JSON authoritative and
        # emit a compatibility loader for double-click use.
        js_path = output_path.with_suffix(".js")
        js_payload = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
        js_payload = js_payload.replace("\u2028", "\\u2028").replace("\u2029", "\\u2029")
        js_tmp = js_path.with_suffix(js_path.suffix + ".tmp")
        js_tmp.write_text("window.__DASHBOARD_DATA__ = " + js_payload + ";\n", encoding="utf-8")
        js_tmp.replace(js_path)
        output_path.parent.mkdir(parents=True, exist_ok=True)
        tmp = output_path.with_suffix(output_path.suffix + ".tmp")
        tmp.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
        tmp.replace(output_path)
        return payload
    finally:
        reader.close()


def parse_args(argv=None):
    parser = argparse.ArgumentParser(description="生成供应链平台标准数据 dashboard_data.json")
    parser.add_argument("--mode", choices=("competition", "internal"), default="competition", help="competition=部分脱敏+仅1501；internal=真实数据+全部工厂")
    parser.add_argument("--input", help="输入 Excel；competition 默认查找部分脱敏工作簿，internal 默认查找真实总表")
    parser.add_argument("--external-market", default=str(DEFAULT_EXTERNAL), help="外部行情 JSON 路径")
    parser.add_argument("--output", help="输出 JSON 路径；默认按 mode 选择")
    parser.add_argument("--date", help="报告日期 YYYY-MM-DD，默认今天")
    parser.add_argument("-v", "--verbose", action="store_true")
    return parser.parse_args(argv)


def main(argv=None) -> int:
    args = parse_args(argv)
    logging.basicConfig(level=logging.DEBUG if args.verbose else logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s", datefmt="%H:%M:%S", stream=sys.stdout)
    today = _date(args.date) if args.date else date.today()
    if today is None:
        LOG.error("--date 格式错误，应为 YYYY-MM-DD")
        return 2
    try:
        input_path, warnings = resolve_input(args.input, args.mode)
        default_output = DEFAULT_OUTPUT if args.mode == "competition" else INTERNAL_OUTPUT
        output_path = Path(args.output).expanduser().resolve() if args.output else default_output.resolve()
        external_path = Path(args.external_market).expanduser().resolve()
        LOG.info("模式：%s", args.mode)
        LOG.info("输入：%s", input_path)
        LOG.info("输出：%s", output_path)
        payload = generate(input_path, output_path, external_path, today, warnings, args.mode)
    except Exception as exc:
        LOG.exception("生成失败：%s", exc)
        return 1
    for warning in payload["meta"]["warnings"]:
        LOG.warning(warning)
    overview = payload["overview"]
    LOG.info("完成：%s · 健康分 %.1f · 物料 %s · 行动 %s · 待复核 %s · 输出 %.1f KB", args.mode, overview["health"]["score"], len(payload["supply"]["materials"]), len(payload["supply"]["actions"]), overview["decision_cards"]["review"]["count"], output_path.stat().st_size / 1024)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
