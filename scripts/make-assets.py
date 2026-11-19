#!/usr/bin/env python3
"""Draw the app icon and the sample Chebyshev figure. No third-party packages."""

import math
import struct
import zlib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def chunk(tag: bytes, data: bytes) -> bytes:
    return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)


def write_png(path: Path, width: int, height: int, pixels: bytes) -> None:
    raw = bytearray()
    stride = width * 4
    for y in range(height):
        raw.append(0)
        raw.extend(pixels[y * stride : (y + 1) * stride])
    png = b"\x89PNG\r\n\x1a\n"
    png += chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress(bytes(raw), 9))
    png += chunk(b"IEND", b"")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(png)


def blend(dst, src, coverage: float) -> tuple[int, int, int, int]:
    a = coverage * src[3] / 255
    out_a = a + dst[3] / 255 * (1 - a)
    if out_a <= 0:
        return (0, 0, 0, 0)
    def ch(i):
        return round((src[i] * a + dst[i] * dst[3] / 255 * (1 - a)) / out_a)
    return (ch(0), ch(1), ch(2), round(out_a * 255))


def sd_round_box(px: float, py: float, half: float, radius: float) -> float:
    qx = abs(px) - (half - radius)
    qy = abs(py) - (half - radius)
    return math.hypot(max(qx, 0), max(qy, 0)) + min(max(qx, qy), 0) - radius


def point_in_triangle(px: float, py: float, a, b, c) -> bool:
    def sign(p1, p2, p3):
        return (p1[0] - p3[0]) * (p2[1] - p3[1]) - (p2[0] - p3[0]) * (p1[1] - p3[1])
    d1 = sign((px, py), a, b)
    d2 = sign((px, py), b, c)
    d3 = sign((px, py), c, a)
    has_neg = d1 < 0 or d2 < 0 or d3 < 0
    has_pos = d1 > 0 or d2 > 0 or d3 > 0
    return not (has_neg and has_pos)


def make_icon(size: int = 1024) -> None:
    samples = 4
    buf = bytearray(size * size * 4)
    half = size / 2
    radius = size * 0.22
    circle_r = size * 0.31
    # nabla pointing up
    top = (size * 0.50, size * 0.34)
    left = (size * 0.33, size * 0.67)
    right = (size * 0.67, size * 0.67)
    ink = (28, 23, 20, 255)
    paper = (246, 241, 231, 255)
    seal = (143, 61, 43, 255)
    for y in range(size):
        for x in range(size):
            acc = [0, 0, 0, 0]
            for sy in range(samples):
                for sx in range(samples):
                    px = x + (sx + 0.5) / samples
                    py = y + (sy + 0.5) / samples
                    color = (0, 0, 0, 0)
                    dist = sd_round_box(px - half, py - half, half, radius)
                    if dist < 0.6:
                        color = ink
                        if math.hypot(px - half, py - half) <= circle_r:
                            color = paper
                            if point_in_triangle(px, py, top, left, right):
                                color = seal
                    acc[0] += color[0]
                    acc[1] += color[1]
                    acc[2] += color[2]
                    acc[3] += color[3]
            n = samples * samples
            i = (y * size + x) * 4
            buf[i : i + 4] = bytes(round(c / n) for c in acc)
    write_png(ROOT / "build" / "icon.png", size, size, bytes(buf))


def make_figure() -> None:
    n = 16
    nodes = [math.cos(math.pi * j / n) for j in range(n + 1)]
    width, height = 720, 240
    left, right = 56, 664
    axis_y = 168

    def map_x(x: float) -> float:
        return left + (x + 1) / 2 * (right - left)

    def runge(x: float) -> float:
        return 1 / (1 + 25 * x * x)

    pts = []
    for i in range(121):
        x = -1 + 2 * i / 120
        y = axis_y - runge(x) * 108
        pts.append(f"{map_x(x):.1f},{y:.1f}")
    circles = []
    for x in nodes:
        cx, cy = map_x(x), axis_y - runge(x) * 108
        circles.append(
            f'<circle cx="{cx:.1f}" cy="{cy:.1f}" r="5.5" fill="#8f3d2b" stroke="#f7f3ea" stroke-width="1.5"/>'
        )
    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}">
  <rect width="{width}" height="{height}" rx="12" fill="#f7f3ea"/>
  <line x1="{left}" y1="{axis_y}" x2="{right}" y2="{axis_y}" stroke="#d9d0c2" stroke-width="1.5"/>
  <path d="M {' L '.join(pts)}" fill="none" stroke="#8f3d2b" stroke-width="2.2"/>
  {''.join(circles)}
  <text x="56" y="36" fill="#5c5348" font-family="Noto Sans CJK SC, sans-serif" font-size="16">Chebyshev 节点，N = 16</text>
  <text x="48" y="210" fill="#8a7f72" font-family="Noto Sans CJK SC, sans-serif" font-size="13">-1</text>
  <text x="676" y="210" fill="#8a7f72" font-family="Noto Sans CJK SC, sans-serif" font-size="13">1</text>
</svg>
'''
    out = ROOT / "samples" / "figures" / "nodes.svg"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(svg, encoding="utf-8")


if __name__ == "__main__":
    make_figure()
    make_icon()
    print("assets ok")
