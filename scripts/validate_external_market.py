#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Validate WorkBuddy external_market.json before generating dashboard data."""

from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


CORE_NAMES = ("布伦特原油", "乙烯", "苯乙烯")
REQUIRED_TEXT_FIELDS = ("unit", "date", "source")


def parse_number(value: Any) -> float | None:
    if value is None or value == "" or isinstance(value, bool):
        return None
    text = str(value).strip().replace("%", "")
    try:
        number = float(text)
    except ValueError:
        return None
    return number if number == number and abs(number) != float("inf") else None


def parse_timestamp(value: Any) -> datetime | None:
    text = str(value or "").strip()
    if not text:
        return None
    if text.endswith("Z"):
        text = text[:-1] + "+00:00"
    try:
        parsed = datetime.fromisoformat(text)
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed


def validate_market(payload: Any, strict_featured: bool) -> tuple[list[str], list[str], dict[str, int]]:
    errors: list[str] = []
    warnings: list[str] = []
    stats = {"items": 0, "with_price": 0, "with_change": 0}

    if not isinstance(payload, dict):
        return ["顶层必须是 JSON 对象"], warnings, stats

    if not str(payload.get("updated_at") or "").strip():
        errors.append("缺少 updated_at")

    items = payload.get("items")
    if not isinstance(items, list) or not items:
        return [*errors, "items 必须是非空数组"], warnings, stats

    seen_names: set[str] = set()
    for index, item in enumerate(items, start=1):
        prefix = f"items[{index}]"
        if not isinstance(item, dict):
            errors.append(f"{prefix} 必须是对象")
            continue

        name = str(item.get("name") or "").strip()
        if not name:
            errors.append(f"{prefix} 缺少 name")
            continue
        if name in seen_names:
            errors.append(f"{prefix} 名称重复：{name}")
            continue
        seen_names.add(name)
        stats["items"] += 1

        price = parse_number(item.get("price"))
        if price is not None and price <= 0:
            errors.append(f"{prefix} price 必须大于 0：{name}")
        if price is None:
            if name in CORE_NAMES:
                errors.append(f"比赛重点品种缺少有效 price：{name}")
            else:
                warnings.append(f"{name} 没有有效 price，不会进入价格卡片")
        else:
            stats["with_price"] += 1

        change = parse_number(item.get("change_pct"))
        if change is not None:
            stats["with_change"] += 1
        elif item.get("change_pct") not in (None, ""):
            errors.append(f"{prefix} change_pct 不是有效数字：{name}")
        else:
            warnings.append(f"{name} 的 change_pct 为空，7 天曲线将按横盘展示")

        for field in REQUIRED_TEXT_FIELDS:
            if not str(item.get(field) or "").strip():
                message = f"{name} 缺少 {field}"
                if name in CORE_NAMES:
                    errors.append(message)
                else:
                    warnings.append(message)

        if item.get("url") and not str(item["url"]).startswith(("http://", "https://")):
            warnings.append(f"{name} 的 url 不是 http(s) 地址")

    if strict_featured:
        missing = [name for name in CORE_NAMES if name not in seen_names]
        if missing:
            errors.append("比赛重点品种缺失：" + "、".join(missing))

    return errors, warnings, stats


def main() -> int:
    parser = argparse.ArgumentParser(description="校验 WorkBuddy 写入的 external_market.json")
    parser.add_argument("--input", default="data/external_market.json", help="行情 JSON 路径")
    parser.add_argument(
        "--strict-featured",
        action="store_true",
        help="要求布伦特原油、乙烯、苯乙烯三个比赛重点品种存在且价格有效",
    )
    parser.add_argument(
        "--max-age-hours",
        type=float,
        default=0,
        help="updated_at 允许的最大时效小时数；0 表示不检查",
    )
    args = parser.parse_args()

    path = Path(args.input)
    if not path.is_file():
        print(f"[ERROR] 文件不存在：{path}")
        return 1
    try:
        payload = json.loads(path.read_text(encoding="utf-8-sig"))
    except json.JSONDecodeError as exc:
        print(f"[ERROR] JSON 解析失败：{exc}")
        return 1

    errors, warnings, stats = validate_market(payload, args.strict_featured)
    if args.max_age_hours > 0:
        updated_at = parse_timestamp(payload.get("updated_at") if isinstance(payload, dict) else None)
        if updated_at is None:
            errors.append("updated_at 必须是可解析的 ISO 时间")
        else:
            now = datetime.now(updated_at.tzinfo)
            age_hours = (now - updated_at).total_seconds() / 3600
            stats["age_hours"] = round(age_hours, 1)
            if age_hours > args.max_age_hours:
                errors.append(
                    f"updated_at 已过期 {age_hours:.1f} 小时，超过允许的 {args.max_age_hours:g} 小时"
                )
            elif age_hours < -2:
                warnings.append(f"updated_at 比当前时间超前 {-age_hours:.1f} 小时，请检查时区")
    for warning in warnings:
        print(f"[WARN] {warning}")
    for error in errors:
        print(f"[ERROR] {error}")

    if errors:
        return 1

    print(
        "[OK] external_market.json 校验通过 "
        f"items={stats['items']} price={stats['with_price']} change={stats['with_change']} age_hours={stats.get('age_hours', 'n/a')}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())