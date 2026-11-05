#!/usr/bin/env python3
# Atkinson-dither a photo of a marble sculpture into a 1-bit transparent PNG (Mac System 6 look).
# Usage: python3 scripts/dither.py input.jpg public/art/out.png [inkHex]   (requires Pillow)
import sys
from PIL import Image, ImageFilter, ImageOps, ImageEnhance
src, out = sys.argv[1], sys.argv[2]
im = Image.open(src).convert('RGB')
W, H = im.size
px = im.load()
# Mask: marble is warm/bright; background is neutral gray.
mask = Image.new('L', im.size, 0); m = mask.load()
for y in range(H):
    for x in range(W):
        r, g, b = px[x, y]
        warm = r - b
        if warm > 14 or (r + g + b) / 3 > 205: m[x, y] = 255
mask = mask.filter(ImageFilter.MaxFilter(9)).filter(ImageFilter.MinFilter(9))  # close holes
mask = mask.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.MaxFilter(3))  # remove specks
# keep largest blob roughly: crop to bbox
bbox = mask.getbbox(); im = im.crop(bbox); mask = mask.crop(bbox)
size = 360
scale = size / max(im.size)
im = im.resize((int(im.width * scale), int(im.height * scale)), Image.LANCZOS)
mask = mask.resize(im.size, Image.LANCZOS).point(lambda v: 255 if v > 128 else 0)
g = ImageOps.grayscale(im)
g = ImageEnhance.Contrast(g).enhance(1.6)
g = ImageEnhance.Brightness(g).enhance(1.05)
# Atkinson dithering (the original Macintosh algorithm)
w, h = g.size
buf = [[g.getpixel((x, y)) for x in range(w)] for y in range(h)]
res = Image.new('RGBA', (w, h), (0, 0, 0, 0)); rp = res.load(); mp = mask.load()
ink = tuple(int(sys.argv[3][i:i+2], 16) for i in (0, 2, 4)) if len(sys.argv) > 3 else (27, 21, 48)
for y in range(h):
    for x in range(w):
        old = buf[y][x]; new = 255 if old > 128 else 0
        err = (old - new) / 8
        for dx, dy in ((1,0),(2,0),(-1,1),(0,1),(1,1),(0,2)):
            nx, ny = x+dx, y+dy
            if 0 <= nx < w and 0 <= ny < h: buf[ny][nx] += err
        if mp[x, y]:
            rp[x, y] = (255, 255, 255, 255) if new else ink + (255,)
res.save(out, optimize=True)
print(res.size)
