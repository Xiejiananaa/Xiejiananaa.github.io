# -*- coding: utf-8 -*-
"""Validate the public dashboard JSON contract before deployment.

The validator intentionally uses only the Python standard library so it can run
both in WorkBuddy and in GitHub Actions without extra dependencies.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from dataclasses import dataclass, field
from datetime import date, datetime
from pathlib import Path
from typing import Any, Iterable

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_INPUT = ROOT / "data" / "dashboard_data.json"

REQUIRED_TOP_LEVEL = ("meta", "overview", "supply", "warehouse", "data_quality", "provenance")
REQUIRED_META = (
    "contract_version",
    "model_version",
    "generated_at",
    "as_of",
    "mode",
    "visibility",
    "desensitized",
    "quantity_unit",
    "source_file",
    "row_counts",
    "warnings",
)
REQUIRED_MATERIAL_FIELDS = (
    "key",
    "material",
    "description",
    "plant",
    "supplier",
    "available",
    "incoming",
    "safety_stock",
    "dynamic_inventory_days",
    "coverage_days",
    "atp_commit_qty",
    "suggested_replenishment",
    "warning_status",
)
REQUIRED_ACTION_FIELDS = (
    "key",
    "material",
    "description",
    "plant",
    "supplier",
    "suggested_replenishment",
    "decision_bucket",
    "warning_status",
)
ALLOWED_WARNING_STATUS = {"CRITICAL", "WATCH", "NORMAL", "NO_DEMAND"}
ALLOWED_DECISION_BUCKETS = {"overdue", "unscheduled", "later", "due_today", "due_7d"}
ALLOWED_RISK_LABELS = {"高风险", "需关注", "低风险"}
MASK_PLACEHOLDERS = {"", "-", "—", "未知", "未识别", "未定位", "未分组", "暂无", "其他"}
PATH_PATTERN = re.compile(r"(?:^|[\s\"'])(?:[A-Za-z]:[\\/]|/Users/|/home/|%TEMP%)", re.IGNORECASE)
SENSITIVE_KEY_TOKENS = ("password", "passwd", "secret", "api_key", "apikey", "access_token", "private_key")


@dataclass
class Report:
    errors: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)

    def error(self, message: str) -> None:
        self.errors.append(message)

    def warning(self, message: str) -> None:
        self.warnings.append(message)


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8-sig"))


def walk(value: Any, path: str = "$") -> Iterable[tuple[str, Any]]:
    yield path, value
    if isinstance(value, dict):
        for key, child in value.items():
            yield from walk(child, f"{path}.{key}")
    elif isinstance(value, list):
        for index, child in enumerate(value):
            yield from walk(child, f"{path}[{index}]")


def as_list(value: Any, label: str, report: Report) -> list[Any]:
    if isinstance(value, list):
        return value
    report.error(f"{label} 必须是数组")
    return []


def as_dict(value: Any, label: str, report: Report) -> dict[str, Any]:
    if isinstance(value, dict):
        return value
    report.error(f"{label} 必须是对象")
    return {}


def is_number(value: Any) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool)


def date_text(value: Any) -> str:
    return str(value or "").strip()


def is_masked(value: Any) -> bool:
    text = date_text(value)
    return not text or "**" in text or text in MASK_PLACEHOLDERS


def count_checked(report: Report, value: Any, label: str, minimum: float = 0) -> None:
    if value is None:
        return
    if not is_number(value):
        report.error(f"{label} 必须是数字")
    elif value < minimum:
        report.error(f"{label} 不能小于 {minimum:g}")


def rate_checked(report: Report, value: Any, label: str) -> None:
    if value is None:
        return
    if not is_number(value):
        report.error(f"{label} 必须是数字")
    elif not 0 <= value <= 100:
        report.error(f"{label} 应在 0 到 100 之间，当前为 {value}")


def check_date(value: Any, label: str, report: Report) -> None:
    text = date_text(value)
    if not text:
        report.error(f"{label} 不能为空")
        return
    try:
        date.fromisoformat(text[:10])
    except ValueError:
        report.error(f"{label} 不是有效日期: {text}")


def check_datetime(value: Any, label: str, report: Report) -> None:
    text = date_text(value)
    if not text:
        report.error(f"{label} 不能为空")
        return
    try:
        datetime.fromisoformat(text.replace("Z", "+00:00"))
    except ValueError:
        report.error(f"{label} 不是有效时间: {text}")


def check_rows(rows: list[Any], label: str, required_fields: tuple[str, ...], report: Report) -> None:
    seen_keys: set[str] = set()
    for index, row in enumerate(rows):
        row_label = f"{label}[{index}]"
        if not isinstance(row, dict):
            report.error(f"{row_label} 必须是对象")
            continue
        missing = [field for field in required_fields if field not in row]
        if missing:
            report.error(f"{row_label} 缺少字段: {', '.join(missing)}")
        key = date_text(row.get("key"))
        if key:
            if key in seen_keys:
                report.error(f"{row_label} key 重复: {key}")
            seen_keys.add(key)
        plant = date_text(row.get("plant"))
        if not plant:
            report.error(f"{row_label}.plant 不能为空")
        if label.startswith("supply.materials"):
            for field_name in ("available", "incoming", "safety_stock", "suggested_replenishment"):
                count_checked(report, row.get(field_name), f"{row_label}.{field_name}")
            for field_name in ("dynamic_inventory_days", "atp_commit_qty"):
                count_checked(report, row.get(field_name), f"{row_label}.{field_name}")
            # -1 is the documented sentinel for "no demand / no coverage".
            count_checked(report, row.get("coverage_days"), f"{row_label}.coverage_days", minimum=-1)
            status = date_text(row.get("warning_status"))
            if status and status not in ALLOWED_WARNING_STATUS:
                report.error(f"{row_label}.warning_status 非法: {status}")
        elif label.startswith("supply.actions"):
            count_checked(report, row.get("suggested_replenishment"), f"{row_label}.suggested_replenishment")
            bucket = date_text(row.get("decision_bucket"))
            if bucket and bucket not in ALLOWED_DECISION_BUCKETS:
                report.error(f"{row_label}.decision_bucket 非法: {bucket}")


def collect_supplier_values(data: dict[str, Any]) -> list[str]:
    values: list[str] = []
    supply = data.get("supply") or {}
    for section in ("materials", "actions"):
        for row in supply.get(section, []) if isinstance(supply.get(section), list) else []:
            if isinstance(row, dict):
                values.append(date_text(row.get("supplier")))
    suppliers = supply.get("suppliers") or {}
    for row in suppliers.get("items", []) if isinstance(suppliers.get("items"), list) else []:
        if isinstance(row, dict):
            values.append(date_text(row.get("name")))
    return values


def collect_description_values(data: dict[str, Any]) -> list[str]:
    values: list[str] = []
    supply = data.get("supply") or {}
    for section in ("materials", "actions"):
        for row in supply.get(section, []) if isinstance(supply.get(section), list) else []:
            if isinstance(row, dict):
                values.append(date_text(row.get("description")))
    return values


def validate_structure(data: Any, report: Report) -> dict[str, Any]:
    if not isinstance(data, dict):
        report.error("JSON 根节点必须是对象")
        return {}
    missing = [key for key in REQUIRED_TOP_LEVEL if key not in data]
    if missing:
        report.error(f"缺少顶层字段: {', '.join(missing)}")

    meta = as_dict(data.get("meta"), "meta", report)
    overview = as_dict(data.get("overview"), "overview", report)
    supply = as_dict(data.get("supply"), "supply", report)
    warehouse = as_dict(data.get("warehouse"), "warehouse", report)
    quality = as_dict(data.get("data_quality"), "data_quality", report)
    provenance = as_dict(data.get("provenance"), "provenance", report)

    for key in REQUIRED_META:
        if key not in meta:
            report.error(f"meta 缺少字段: {key}")
    check_datetime(meta.get("generated_at"), "meta.generated_at", report)
    check_date(meta.get("as_of"), "meta.as_of", report)

    materials = as_list(supply.get("materials"), "supply.materials", report)
    actions = as_list(supply.get("actions"), "supply.actions", report)
    suppliers = as_dict(supply.get("suppliers"), "supply.suppliers", report)
    supplier_items = as_list(suppliers.get("items"), "supply.suppliers.items", report)
    geo = as_dict(supply.get("geo"), "supply.geo", report)
    check_rows(materials, "supply.materials", REQUIRED_MATERIAL_FIELDS, report)
    check_rows(actions, "supply.actions", REQUIRED_ACTION_FIELDS, report)

    if not isinstance(meta.get("warnings"), list):
        report.error("meta.warnings 必须是数组")
    if not isinstance(meta.get("source_sheets", []), list):
        report.error("meta.source_sheets 必须是数组")
    if not isinstance(overview.get("kpis"), list):
        report.error("overview.kpis 必须是数组")
    if not isinstance(geo.get("provinces"), list):
        report.error("supply.geo.provinces 必须是数组")
    if not isinstance(warehouse.get("plants"), list):
        report.error("warehouse.plants 必须是数组")
    if not isinstance(warehouse.get("locations"), list):
        report.error("warehouse.locations 必须是数组")
    if not isinstance(warehouse.get("aging"), list):
        report.error("warehouse.aging 必须是数组")
    if not isinstance(quality.get("items"), list):
        report.error("data_quality.items 必须是数组")
    if not isinstance(provenance.get("formulas", []), list):
        report.error("provenance.formulas 必须是数组")

    health = as_dict(overview.get("health"), "overview.health", report)
    rate_checked(report, health.get("score"), "overview.health.score")
    if health.get("score") is None:
        report.error("overview.health.score 不能为空")

    row_counts = as_dict(meta.get("row_counts"), "meta.row_counts", report)
    actual_counts = {
        "materials": len(materials),
        "actions": len(actions),
        "suppliers": len(supplier_items),
        "warehouse_batches": (warehouse.get("summary") or {}).get("batch_rows")
        if isinstance(warehouse.get("summary"), dict)
        else None,
    }
    for key, actual in actual_counts.items():
        if key in row_counts and row_counts[key] != actual:
            report.error(f"meta.row_counts.{key}={row_counts[key]}，实际为 {actual}")

    market = supply.get("external_market")
    if not isinstance(market, dict):
        report.error("supply.external_market 必须是对象")
    else:
        if not isinstance(market.get("items"), list):
            report.error("supply.external_market.items 必须是数组")
        if market.get("available") and not market.get("items"):
            report.error("external_market.available=true 但 items 为空")
        if market.get("available") and not date_text(market.get("updated_at")):
            report.warning("external_market 已可用，但 updated_at 为空")

    for value_path, value in walk(data):
        key_name = value_path.rsplit(".", 1)[-1].lower()
        if any(token in key_name for token in SENSITIVE_KEY_TOKENS):
            report.error(f"疑似敏感字段: {value_path}")
        if isinstance(value, str) and PATH_PATTERN.search(value):
            report.error(f"疑似泄漏本机绝对路径: {value_path}")

    return {
        "meta": meta,
        "overview": overview,
        "supply": supply,
        "warehouse": warehouse,
        "quality": quality,
        "provenance": provenance,
        "materials": materials,
        "actions": actions,
        "supplier_items": supplier_items,
    }


def validate_competition(data: dict[str, Any], parsed: dict[str, Any], report: Report) -> None:
    meta = parsed["meta"]
    supply = parsed["supply"]
    warehouse = parsed["warehouse"]
    overview = parsed["overview"]

    if meta.get("mode") != "competition":
        report.error(f"公开版 meta.mode 必须为 competition，当前为 {meta.get('mode')!r}")
    if meta.get("visibility") != "competition":
        report.error(f"公开版 meta.visibility 必须为 competition，当前为 {meta.get('visibility')!r}")
    if meta.get("desensitized") is not True:
        report.error("公开版 meta.desensitized 必须为 true")
    if meta.get("quantity_unit") != "kg":
        report.error("meta.quantity_unit 必须为 kg")
    if date_text(meta.get("source_file")).endswith(".xlsx") is False:
        report.warning("meta.source_file 不是 .xlsx 文件名")
    if "1160" in date_text(meta.get("source_file")):
        report.error("公开版 source_file 含 1160")

    scope = overview.get("scope") if isinstance(overview.get("scope"), dict) else {}
    if scope.get("plant_scope") != "1501":
        report.error("公开版 overview.scope.plant_scope 必须为 1501")
    if "production" in data:
        report.error("比赛版不应包含 production 生产板块")

    plant_sets = {
        "supply.materials": {date_text(row.get("plant")) for row in parsed["materials"] if isinstance(row, dict)},
        "supply.actions": {date_text(row.get("plant")) for row in parsed["actions"] if isinstance(row, dict)},
        "warehouse.plants": {date_text(row.get("plant")) for row in warehouse.get("plants", []) if isinstance(row, dict)},
        "warehouse.locations": {date_text(row.get("plant")) for row in warehouse.get("locations", []) if isinstance(row, dict)},
    }
    for label, plants in plant_sets.items():
        unexpected = sorted(plant for plant in plants if plant and plant != "1501")
        if unexpected:
            report.error(f"{label} 出现非 1501 工厂: {', '.join(unexpected)}")
        if not plants:
            report.error(f"{label} 没有有效工厂值")

    for index, supplier in enumerate(parsed["supplier_items"]):
        if not isinstance(supplier, dict):
            report.error(f"supply.suppliers.items[{index}] 必须是对象")
            continue
        if supplier.get("scope") not in (None, "mb51_plant_1501"):
            report.error(f"supply.suppliers.items[{index}].scope 非比赛口径: {supplier.get('scope')}")
        rate_checked(report, supplier.get("on_time_rate"), f"supply.suppliers.items[{index}].on_time_rate")
        rate_checked(report, supplier.get("delivery_health_score"), f"supply.suppliers.items[{index}].delivery_health_score")
        risk_label = date_text(supplier.get("risk_label"))
        if risk_label and risk_label not in ALLOWED_RISK_LABELS:
            report.error(f"supply.suppliers.items[{index}].risk_label 非法: {risk_label}")

    supplier_values = collect_supplier_values(data)
    unmasked_suppliers = sorted({value for value in supplier_values if not is_masked(value)})
    if unmasked_suppliers:
        report.error("公开版存在未脱敏供应商名称: " + ", ".join(unmasked_suppliers[:10]))

    descriptions = collect_description_values(data)
    unmasked_descriptions = sorted({value for value in descriptions if not is_masked(value)})
    if unmasked_descriptions:
        report.error("公开版存在未脱敏物料描述: " + ", ".join(unmasked_descriptions[:10]))

    exclusions = meta.get("exclusions") if isinstance(meta.get("exclusions"), dict) else {}
    if exclusions.get("legacy_plant_policy") != "competition_excluded":
        report.error("公开版历史工厂策略必须为 competition_excluded")
    if exclusions.get("no_demand_policy") != "competition_excluded":
        report.error("公开版无消耗行策略必须为 competition_excluded")


def validate_internal(data: dict[str, Any], parsed: dict[str, Any], report: Report) -> None:
    meta = parsed["meta"]
    if meta.get("mode") != "internal":
        report.error(f"内部版 meta.mode 必须为 internal，当前为 {meta.get('mode')!r}")
    if meta.get("visibility") != "internal":
        report.error(f"内部版 meta.visibility 必须为 internal，当前为 {meta.get('visibility')!r}")
    if meta.get("desensitized") is not False:
        report.error("内部版 meta.desensitized 必须为 false")
    if "production" not in data:
        report.error("内部版缺少 production 生产板块")
    plants = {date_text(row.get("plant")) for row in parsed["materials"] if isinstance(row, dict)}
    if "1160" in plants:
        report.warning("内部版包含工厂 1160；仅允许本地使用，禁止发布到公开页面")


def check_baseline(current: dict[str, Any], baseline_path: Path, max_drop_pct: float, report: Report) -> None:
    if not baseline_path.is_file():
        report.error(f"baseline 文件不存在: {baseline_path}")
        return
    try:
        previous = load_json(baseline_path)
    except Exception as exc:
        report.error(f"baseline 读取失败: {exc}")
        return
    if not isinstance(previous, dict):
        report.error("baseline 根节点必须是对象")
        return
    prev_meta = previous.get("meta") or {}
    curr_meta = current.get("meta") or {}
    if prev_meta.get("mode") != curr_meta.get("mode"):
        report.warning("baseline 与当前文件模式不同，跳过数量对比")
        return

    def section_count(payload: dict[str, Any], section: str) -> int:
        supply = payload.get("supply") or {}
        if section == "suppliers":
            return len((supply.get("suppliers") or {}).get("items") or [])
        return len(supply.get(section) or [])

    for section, label in (("materials", "物料"), ("actions", "行动"), ("suppliers", "供应商")):
        old = section_count(previous, section)
        new = section_count(current, section)
        if old >= 5 and new < old * (1 - max_drop_pct / 100):
            report.error(f"{label}数量较 baseline 下降超过 {max_drop_pct:g}%: {old} -> {new}")

    old_critical = sum(1 for row in (previous.get("supply") or {}).get("materials", []) if isinstance(row, dict) and row.get("warning_status") == "CRITICAL")
    new_critical = sum(1 for row in (current.get("supply") or {}).get("materials", []) if isinstance(row, dict) and row.get("warning_status") == "CRITICAL")
    if old_critical >= 3 and new_critical > old_critical * 3 + 5:
        report.warning(f"严重档物料数异常上升: {old_critical} -> {new_critical}")


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="校验 dashboard_data.json 是否可以安全发布")
    parser.add_argument("--input", type=Path, default=DEFAULT_INPUT, help="待校验 JSON，默认 data/dashboard_data.json")
    parser.add_argument("--mode", choices=("competition", "internal"), default="competition", help="校验口径")
    parser.add_argument("--baseline", type=Path, help="上一版 JSON，用于阻止物料/行动数量异常骤降")
    parser.add_argument("--max-drop-pct", type=float, default=30.0, help="相对 baseline 允许的最大下降百分比，默认 30")
    parser.add_argument("--strict-warnings", action="store_true", help="有 warning 也返回失败")
    parser.add_argument("--quiet", action="store_true", help="成功时不输出摘要")
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    input_path = args.input.expanduser().resolve()
    if not input_path.is_file():
        print(f"[FAIL] 文件不存在: {input_path}", file=sys.stderr)
        return 2

    report = Report()
    try:
        data = load_json(input_path)
    except Exception as exc:
        print(f"[FAIL] JSON 读取失败: {exc}", file=sys.stderr)
        return 2

    parsed = validate_structure(data, report)
    if args.mode == "competition":
        validate_competition(data, parsed, report)
    else:
        validate_internal(data, parsed, report)
    if args.baseline:
        check_baseline(data, args.baseline.expanduser().resolve(), args.max_drop_pct, report)

    for warning in report.warnings:
        print(f"[WARN] {warning}")
    for error in report.errors:
        print(f"[ERROR] {error}", file=sys.stderr)

    if report.errors or (args.strict_warnings and report.warnings):
        print(f"[FAIL] 校验未通过：{len(report.errors)} 个错误，{len(report.warnings)} 个警告", file=sys.stderr)
        return 1

    if not args.quiet:
        supply = data.get("supply") or {}
        print("[OK] dashboard_data.json 校验通过")
        print(f"mode={data.get('meta', {}).get('mode')} materials={len(supply.get('materials') or [])} actions={len(supply.get('actions') or [])} suppliers={len((supply.get('suppliers') or {}).get('items') or [])}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())