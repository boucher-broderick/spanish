#!/usr/bin/env python3
"""Deterministic blank-line detector for the workbook pages.

Blanks in this textbook are thin horizontal underscore runs with white space
directly above (where the student writes) and below. We find those runs and
emit their bounding boxes, normalized to 0..1 over the page image, so the web
overlay can place an <input> on each blank regardless of display size.

No model, no network, no cost — just Pillow + numpy.

Usage:
    python3 parser/detect_blanks.py public/book/page-015.png            # -> JSON to stdout
    python3 parser/detect_blanks.py public/book/page-015.png --debug out.png   # draw boxes
"""
import json
import sys

import numpy as np
from PIL import Image, ImageDraw

# Tunables (in pixels, relative to the ~1506px-wide -r85 render).
INK_THRESHOLD = 130      # < this (0=black) counts as ink
MIN_LEN = 28             # shortest underscore run we accept
MAX_THICK = 5            # underscore lines are thin; thicker => table/box border
CLEAR_ABOVE = (3, 11)    # rows above the line that must be ~white (write space)
CLEAR_BELOW = (2, 7)     # rows below the line that must be ~white
CLEAR_FRAC = 0.92        # fraction of the run width that must be clear above/below
MAX_LEN_FRAC = 0.85      # runs spanning > this fraction of width => section divider, skip


def detect_badges(ink, H, W):
    """Find the solid-black 'ejercicio' bars: bands of rows with a long, dense
    run of ink. Returns list of bbox dicts (normalized) top-to-bottom."""
    dense_rows = []
    for y in range(H):
        row = ink[y]
        if row.mean() < 0.08:
            continue
        # longest run of ink in this row
        idx = np.flatnonzero(row)
        if idx.size == 0:
            continue
        splits = np.flatnonzero(np.diff(idx) > 2)
        starts = np.concatenate(([0], splits + 1))
        ends = np.concatenate((splits, [idx.size - 1]))
        best = max(((idx[e] - idx[s], idx[s], idx[e]) for s, e in zip(starts, ends)),
                   key=lambda t: t[0])
        runlen, x0, x1 = best
        if runlen > 0.10 * W and row[x0:x1 + 1].mean() > 0.85:
            dense_rows.append((y, x0, x1))
    # group rows into bands; allow small vertical gaps so one bar isn't split
    bands = []
    cur = []
    for r in dense_rows:
        if cur and r[0] - cur[-1][0] > max(4, int(0.02 * H)):
            bands.append(cur); cur = []
        cur.append(r)
    if cur:
        bands.append(cur)
    out = []
    for band in bands:
        if len(band) < 6:  # badge bar is ~0.03H tall; ignore stray dense rows
            continue
        ys = [r[0] for r in band]
        x0 = min(r[1] for r in band); x1 = max(r[2] for r in band)
        out.append({
            "x": round(x0 / W, 5), "y": round(min(ys) / H, 5),
            "w": round((x1 - x0) / W, 5), "h": round((max(ys) - min(ys)) / H, 5),
            "cy": round((min(ys) + max(ys)) / 2 / H, 5),
        })
    out.sort(key=lambda b: b["cy"])
    return out


def detect(path):
    img = Image.open(path).convert("L")
    a = np.asarray(img)
    H, W = a.shape
    ink = a < INK_THRESHOLD
    badges = detect_badges(ink, H, W)

    # A pixel is "line-like" if it's ink and the band above & below is mostly white.
    boxes = []  # (x0, y0, x1, y1) in pixels
    y = CLEAR_ABOVE[1] + 1
    used = np.zeros(H, dtype=bool)  # rows already consumed by a detected line
    while y < H - CLEAR_BELOW[1] - 1:
        if used[y]:
            y += 1
            continue
        row = ink[y]
        if not row.any():
            y += 1
            continue
        above = ~ink[y - CLEAR_ABOVE[1]:y - CLEAR_ABOVE[0] + 1].any(axis=0)
        below = ~ink[y + CLEAR_BELOW[0]:y + CLEAR_BELOW[1] + 1].any(axis=0)
        line = row & above & below
        # find horizontal runs in `line`
        idx = np.flatnonzero(line)
        if idx.size == 0:
            y += 1
            continue
        splits = np.flatnonzero(np.diff(idx) > 3)  # allow tiny gaps (anti-alias)
        starts = np.concatenate(([0], splits + 1))
        ends = np.concatenate((splits, [idx.size - 1]))
        found = False
        for s, e in zip(starts, ends):
            x0, x1 = idx[s], idx[e]
            length = x1 - x0
            if length < MIN_LEN or length > W * MAX_LEN_FRAC:
                continue
            # measure thickness: how many rows downward stay inky in this x-range
            thick = 1
            for dy in range(1, MAX_THICK + 3):
                if y + dy >= H:
                    break
                seg = ink[y + dy, x0:x1 + 1]
                if seg.mean() > 0.5:
                    thick += 1
                else:
                    break
            if thick > MAX_THICK:
                continue  # too thick => border/rule, not an underscore
            # confirm clear bands across the run width
            run_above = above[x0:x1 + 1].mean()
            run_below = below[x0:x1 + 1].mean()
            if run_above < CLEAR_FRAC or run_below < CLEAR_FRAC:
                continue
            boxes.append((int(x0), int(y), int(x1), int(y + thick)))
            used[y:y + thick + 1] = True
            found = True
        y += (1 if not found else 2)

    # normalize 0..1
    out = []
    for x0, y0, x1, y1 in boxes:
        out.append({
            "x": round(x0 / W, 5),
            "y": round(y0 / H, 5),
            "w": round((x1 - x0) / W, 5),
            "h": round(max(y1 - y0, 2) / H, 5),
            "cx": round((x0 + x1) / 2 / W, 5),
            "cy": round((y0 + y1) / 2 / H, 5),
        })
    # Emit RAW geometry. We deliberately do NOT filter blanks by badge position:
    # badges include look-alike boxes ('vocabulario'), and exercises span page
    # breaks, so cross-filtering drops legitimate blanks. The join step decides
    # which blanks are real by matching against Claude's text reading (by vertical
    # position), which naturally ignores table rules / box borders.
    out.sort(key=lambda b: (round(b["cy"], 3), b["cx"]))
    return {"w": W, "h": H, "badges": badges, "blanks": out}


def main():
    path = sys.argv[1]
    res = detect(path)
    if "--debug" in sys.argv:
        dbg = sys.argv[sys.argv.index("--debug") + 1]
        im = Image.open(path).convert("RGB")
        d = ImageDraw.Draw(im)
        for g in res["badges"]:
            x0 = g["x"] * res["w"]; y0 = g["y"] * res["h"]
            d.rectangle([x0, y0, x0 + g["w"] * res["w"], y0 + g["h"] * res["h"]],
                        outline=(0, 90, 220), width=3)
        for b in res["blanks"]:
            x0 = b["x"] * res["w"]; y0 = b["y"] * res["h"]
            x1 = x0 + b["w"] * res["w"]; y1 = y0 + b["h"] * res["h"]
            d.rectangle([x0, y0 - 3, x1, y1 + 3], outline=(220, 0, 0), width=2)
        im.save(dbg)
        print(f"{len(res['blanks'])} blanks -> {dbg}", file=sys.stderr)
    print(json.dumps(res))


if __name__ == "__main__":
    main()
