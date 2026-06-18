#!/usr/bin/env python3
"""Run blank/badge detection over every rendered page and cache the geometry.

Output: parser/cache/geometry.json  ->  { "page-015": {w,h,badges,blanks}, ... }
This is pure local image processing (no model, no network). Re-run anytime pages
are re-rendered.
"""
import json
import os
import sys

from detect_blanks import detect

HERE = os.path.dirname(os.path.abspath(__file__))
PAGES_DIR = os.path.join(HERE, "..", "public", "book")
OUT = os.path.join(HERE, "cache", "geometry.json")


def main():
    only = sys.argv[1:]  # optional list of "page-015" stems to limit to
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    files = sorted(f for f in os.listdir(PAGES_DIR) if f.endswith(".png"))
    result = {}
    for f in files:
        stem = f[:-4]
        if only and stem not in only:
            continue
        res = detect(os.path.join(PAGES_DIR, f))
        result[stem] = res
        n_ex = len(res["badges"]); n_bl = len(res["blanks"])
        if n_ex or n_bl:
            print(f"{stem}: {n_ex} badges, {n_bl} blanks")
    # merge into existing cache so partial runs accumulate
    if os.path.exists(OUT):
        existing = json.load(open(OUT))
        existing.update(result)
        result = existing
    json.dump(result, open(OUT, "w"), ensure_ascii=False)
    print(f"-> {OUT} ({len(result)} pages cached)")


if __name__ == "__main__":
    main()
