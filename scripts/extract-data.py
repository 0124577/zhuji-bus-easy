#!/usr/bin/env python3
"""从 v2.0.0 基线（zhuji-bus-live/index.html）提取静态数据快照。

产物：www/data/snapshot.js  ->  window.SNAPSHOT = { v, generated, names, lines }
  names: 站点名数组，下标即站点名 ID
  lines: [{ n: 线路名, d: [{ k: 'up'|'down', id: 方向线路ID, f: 首班, l: 末班,
                              s: [[站名ID, 到下一站距离(米), 纬度*1e5, 经度*1e5], ...] }] }]

坐标沿用基线口径（GCJ-02，已由基线站点表转换），供 Haversine 距离计算使用。
"""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SRC = os.environ.get("SNAPSHOT_SRC", os.path.join(ROOT, "..", "zhuji-bus-live", "index.html"))
OUT = os.path.join(ROOT, "www", "data", "snapshot.js")


def main():
    with open(SRC, encoding="utf-8") as f:
        html = f.read()
    marker = "const STATION_SNAPSHOT ="
    i = html.index(marker) + len(marker)
    j = html.index(";", i)
    data = json.loads(html[i:j])

    names = data["names"]
    lines = data["lines"]
    stops = 0
    dirs = 0
    for line in lines:
        for d in line["d"]:
            dirs += 1
            stops += len(d["s"])
            for s in d["s"]:
                if not (0 <= s[0] < len(names)):
                    raise SystemExit("站名下标越界：%s" % line["n"])

    payload = {
        "v": 2,
        "generated": data.get("generated", ""),
        "source": "诸暨公交官方站点表（v2.0.0 基线快照）",
        "names": names,
        "lines": lines,
    }

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        f.write("/* 静态数据快照：由 scripts/extract-data.py 生成，请勿手工编辑 */\n")
        f.write("window.SNAPSHOT=")
        json.dump(payload, f, ensure_ascii=False, separators=(",", ":"))
        f.write(";\n")

    size = os.path.getsize(OUT) / 1024.0
    print("线路 %d 条 / 方向 %d 个 / 站点名 %d 个 / 站序 %d 条 / %.0f KB"
          % (len(lines), dirs, len(names), stops, size))


if __name__ == "__main__":
    main()
