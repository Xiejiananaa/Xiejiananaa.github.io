# -*- coding: utf-8 -*-
"""供应商地域归一化（离线，不依赖网络）。

只用名称里的行政区划做识别，识别不出就是「未定位」，绝不猜。
匹配顺序：完整城市名 -> 省份名 -> 未定位。
"""
from __future__ import annotations

import csv
from pathlib import Path

UNLOCATED = "未定位"


class SupplierRegion:
    def __init__(self, mapping_csv: Path):
        self.mapping_csv = Path(mapping_csv)
        self.provinces: dict[str, tuple[float, float]] = {}
        self.cities: dict[str, tuple[str, float, float]] = {}
        self._load()

    def _load(self) -> None:
        if not self.mapping_csv.is_file():
            return
        with self.mapping_csv.open("r", encoding="utf-8-sig", newline="") as fh:
            for row in csv.DictReader(fh):
                level = (row.get("level") or "").strip()
                name = (row.get("name") or "").strip()
                if not name:
                    continue
                lat = _to_float(row.get("lat"))
                lon = _to_float(row.get("lon"))
                if level == "province":
                    self.provinces[name] = (lat, lon)
                elif level == "city":
                    self.cities[name] = ((row.get("parent") or "").strip(), lat, lon)
        # 长名字优先，避免「嘉兴市」被「兴」之类误匹配
        self._city_names = sorted(self.cities, key=len, reverse=True)
        self._prov_names = sorted(self.provinces, key=len, reverse=True)
        # 直辖市：名称里出现城市名即视为该省级行政区
        self.municipalities = {"北京", "天津", "上海", "重庆"}

    # ------------------------------------------------------------------
    def classify(self, supplier_name: str) -> dict:
        """返回 {level, province, city, lat, lon, matched}"""
        raw = (supplier_name or "").strip()
        if not raw:
            return _unlocated()
        for city in self._city_names:
            if city in raw:
                prov, lat, lon = self.cities[city]
                return {
                    "level": "city", "province": prov, "city": city,
                    "lat": lat, "lon": lon, "matched": city,
                }
        for mun in ("北京", "天津", "上海", "重庆"):
            if mun in raw:
                lat, lon = self.provinces.get(mun, (None, None))
                return {
                    "level": "province", "province": mun, "city": mun,
                    "lat": lat, "lon": lon, "matched": mun,
                }
        for prov in self._prov_names:
            if prov in raw:
                lat, lon = self.provinces[prov]
                return {
                    "level": "province", "province": prov, "city": prov,
                    "lat": lat, "lon": lon, "matched": prov,
                }
        return _unlocated()

    # ------------------------------------------------------------------
    def coordinate(self, province: str, city: str, level: str) -> tuple[float | None, float | None]:
        if level == "city" and city in self.cities:
            _, lat, lon = self.cities[city]
            return lat, lon
        if province in self.provinces:
            return self.provinces[province]
        return None, None


def _unlocated() -> dict:
    return {"level": "unknown", "province": "", "city": "", "lat": None, "lon": None, "matched": ""}


def _to_float(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return None
