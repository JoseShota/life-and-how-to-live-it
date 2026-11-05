#!/usr/bin/env python3
"""Cut a marble sculpture out of a museum photo (neutral gray backdrop) into a soft-edged transparent WebP.
Usage: python3 scripts/cutout.py input.jpg public/art/name.webp [height=560]    (requires Pillow)
Tip: use Open Access (public domain) objects from metmuseum.org; check the label on each object page."""
import sys
from PIL import Image, ImageFilter, ImageEnhance

src, out = sys.argv[1], sys.argv[2]
target_h = int(sys.argv[3]) if len(sys.argv) > 3 else 560
im = Image.open(src).convert('RGB')
im.thumbnail((1400, 1400), Image.LANCZOS)
px = im.load(); W, H = im.size
mask = Image.new('L', im.size, 0); m = mask.load()
for y in range(H):
    for x in range(W):
        r, g, b = px[x, y]
        if (r - b) > 14 or (r + g + b) / 3 > 205:  # marble is warm/bright, backdrop is neutral gray
            m[x, y] = 255
k = max(3, (W // 120) | 1)
mask = mask.filter(ImageFilter.MaxFilter(k)).filter(ImageFilter.MinFilter(k))
mask = mask.filter(ImageFilter.MinFilter(5)).filter(ImageFilter.MaxFilter(5))
bbox = mask.getbbox(); im = im.crop(bbox); mask = mask.crop(bbox)
s = target_h / im.height
im = im.resize((int(im.width * s), target_h), Image.LANCZOS)
mask = mask.resize(im.size, Image.LANCZOS).filter(ImageFilter.GaussianBlur(1.6))
im = ImageEnhance.Color(im).enhance(0.75)          # gentle liminal grade
im = ImageEnhance.Brightness(im).enhance(1.06)
outimg = im.convert('RGBA'); outimg.putalpha(mask)
outimg.save(out, quality=88)
print(out, outimg.size)
