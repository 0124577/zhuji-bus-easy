#!/usr/bin/env python3
"""生成诸暨公交（粉色主题）安卓图标与启动图。纯标准库实现，无需 Pillow。"""
import os
import zlib
import struct

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RES = os.path.join(BASE, "android", "app", "src", "main", "res")

PINK = (255, 92, 138)
PINK_D = (233, 61, 110)
PINK_L = (255, 148, 178)
WHITE = (255, 255, 255)


def write_png(path, w, h, px):
    raw = bytearray()
    for y in range(h):
        raw += b"\x00"
        raw += px[y * w * 4:(y + 1) * w * 4]

    def chunk(t, d):
        return struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xFFFFFFFF)

    png = b"\x89PNG\r\n\x1a\n"
    png += chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress(bytes(raw), 9))
    png += chunk(b"IEND", b"")
    with open(path, "wb") as f:
        f.write(png)


def lerp(a, b, t):
    return tuple(int(round(a[i] + (b[i] - a[i]) * t)) for i in range(3))


def rounded(x, y, x0, y0, x1, y1, r):
    if x < x0 or x > x1 or y < y0 or y > y1:
        return False
    cx = min(max(x, x0 + r), x1 - r)
    cy = min(max(y, y0 + r), y1 - r)
    return (x - cx) ** 2 + (y - cy) ** 2 <= r * r


def disc(x, y, cx, cy, r):
    return (x - cx) ** 2 + (y - cy) ** 2 <= r * r


def bus_rgba(u, v):
    """白车身 + 粉色镂空，返回 (r,g,b,a)"""
    # 车身
    body = rounded(u, v, 0.17, 0.19, 0.83, 0.66, 0.09)
    # 车窗 / 腰线（镂空）
    win1 = rounded(u, v, 0.25, 0.27, 0.75, 0.40, 0.03)
    win2 = rounded(u, v, 0.25, 0.44, 0.75, 0.49, 0.02)
    # 车灯
    lamp = disc(u, v, 0.235, 0.575, 0.026) or disc(u, v, 0.765, 0.575, 0.026)
    # 轮子
    wheel = disc(u, v, 0.335, 0.735, 0.085) or disc(u, v, 0.665, 0.735, 0.085)
    hub = disc(u, v, 0.335, 0.735, 0.034) or disc(u, v, 0.665, 0.735, 0.034)
    if hub:
        return (255, 255, 255, 0) if False else (0, 0, 0, 0)
    if wheel:
        return (255, 255, 255, 255)
    if body and not (win1 or win2 or lamp):
        return (255, 255, 255, 255)
    return (0, 0, 0, 0)


def render(size, mode="square", ss=4):
    """mode: square / round / fg（前景透明）"""
    W = size * ss
    px = bytearray(W * W * 4)
    for y in range(W):
        v = (y + 0.5) / W
        for x in range(W):
            u = (x + 0.5) / W
            i = (y * W + x) * 4
            if mode == "fg":
                r, g, b, a = bus_rgba((u - 0.5) * 1.30 + 0.5, (v - 0.5) * 1.30 + 0.5)
                px[i:i + 4] = bytes((r, g, b, a))
                continue
            if mode == "round" and not disc(u, v, 0.5, 0.5, 0.5):
                px[i:i + 4] = b"\x00\x00\x00\x00"
                continue
            r, g, b, a = bus_rgba(u, v)
            if a == 0:
                base = lerp(PINK, PINK_D, v)
                if disc(u, v, 0.86, 0.14, 0.42):
                    base = lerp(base, PINK_L, 0.35)
                px[i:i + 4] = bytes((base[0], base[1], base[2], 255))
            else:
                px[i:i + 4] = bytes((r, g, b, 255))
    # 下采样
    out = bytearray(size * size * 4)
    for y in range(size):
        for x in range(size):
            rs = gs = bs = as_ = 0
            for dy in range(ss):
                row = (y * ss + dy) * W
                for dx in range(ss):
                    i = (row + x * ss + dx) * 4
                    rs += px[i]; gs += px[i + 1]; bs += px[i + 2]; as_ += px[i + 3]
            n = ss * ss
            o = (y * size + x) * 4
            out[o] = rs // n; out[o + 1] = gs // n; out[o + 2] = bs // n; out[o + 3] = as_ // n
    return out


def save(path, size, mode="square"):
    data = render(size, mode)
    write_png(path, size, size, data)
    print("  " + os.path.relpath(path, BASE) + "  " + str(size))


def make_splash(w, h, logo_size=360):
    """粉色渐变背景 + 居中白色巴士 logo"""
    px = bytearray(w * h * 4)
    for y in range(h):
        t = y / max(1, h - 1)
        base = lerp((255, 122, 160), (240, 63, 115), t)
        for x in range(w):
            i = (y * w + x) * 4
            px[i:i + 4] = bytes((base[0], base[1], base[2], 255))
    logo = render(logo_size, "fg", ss=3)
    ox = (w - logo_size) // 2
    oy = (h - logo_size) // 2
    for y in range(logo_size):
        for x in range(logo_size):
            si = (y * logo_size + x) * 4
            a = logo[si + 3]
            if not a:
                continue
            di = ((oy + y) * w + ox + x) * 4
            for k in range(3):
                px[di + k] = (logo[si + k] * a + px[di + k] * (255 - a)) // 255
    return px


def main():
    print("生成应用图标：")
    densities = [("mdpi", 48), ("hdpi", 72), ("xhdpi", 96), ("xxhdpi", 144), ("xxxhdpi", 192)]
    for name, size in densities:
        d = os.path.join(RES, "mipmap-" + name)
        os.makedirs(d, exist_ok=True)
        save(os.path.join(d, "ic_launcher.png"), size, "square")
        save(os.path.join(d, "ic_launcher_round.png"), size, "round")
        save(os.path.join(d, "ic_launcher_foreground.png"), int(size * 108 / 48), "fg")

    print("生成启动图：")
    splash = make_splash(1080, 2340)
    targets = [
        os.path.join(RES, "drawable", "splash.png"),
        os.path.join(RES, "drawable-port-mdpi", "splash.png"),
        os.path.join(RES, "drawable-port-hdpi", "splash.png"),
        os.path.join(RES, "drawable-port-xhdpi", "splash.png"),
        os.path.join(RES, "drawable-port-xxhdpi", "splash.png"),
        os.path.join(RES, "drawable-port-xxxhdpi", "splash.png"),
        os.path.join(RES, "drawable-land-mdpi", "splash.png"),
        os.path.join(RES, "drawable-land-hdpi", "splash.png"),
        os.path.join(RES, "drawable-land-xhdpi", "splash.png"),
        os.path.join(RES, "drawable-land-xxhdpi", "splash.png"),
        os.path.join(RES, "drawable-land-xxxhdpi", "splash.png"),
    ]
    for t in targets:
        os.makedirs(os.path.dirname(t), exist_ok=True)
        write_png(t, 1080, 2340, splash)
        print("  " + os.path.relpath(t, BASE))

    colors = os.path.join(RES, "values", "ic_launcher_background.xml")
    with open(colors, "w", encoding="utf-8") as f:
        f.write('<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#FF5C8A</color>\n</resources>\n')
    print("  values/ic_launcher_background.xml")


if __name__ == "__main__":
    main()
