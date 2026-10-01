#!/usr/bin/env python3
"""
Build public/images/email/masthead.jpg: the aurora masthead at the top of the assessment emails
(lib/assessmentEmail.ts, EMAIL_MASTHEAD). Regenerate with:

    python3 -m venv /tmp/mastheadvenv && /tmp/mastheadvenv/bin/pip install pillow
    /tmp/mastheadvenv/bin/python scripts/build-email-masthead.py

Inputs, both committed:
  public/home/hero-aurora.jpg        2640 x 1485, the site's aurora photograph (app/components/auroraBand.ts)
  logo/themisiq-logo-reversed.png    1692 x 504, the light-on-ink lockup from the logo package

WHY A SCRIPT. The image is derived, and an email masthead is the kind of asset that gets re-exported by hand
from an image editor and drifts: a different crop, a mirrored photo, a logo at the wrong size. Every number
that decides it is here.

THE PHOTO. Crop box (140, 985, 2640, 1485), the lower band of the frame, 2500 x 500, then 1200 x 240 with
LANCZOS: 2x the 600 x 120 it renders at. ⚠️ NEVER FLIPPED OR MIRRORED: the warm glow stays bottom right, as on
the homepage hero (see the note in app/page.tsx).

THE LOGO. The reversed PNG has an OPAQUE background of rgb(17, 25, 39), not transparency, so pasting it would
put a navy rectangle on the sky. The background is keyed out:
    alpha  = clamp(max over channels of (pixel - bg) / (255 - bg), 0, 1)
    colour = (pixel - (1 - alpha) * bg) / alpha          (un-premultiplied, so edges do not carry navy)
then cropped to the alpha bounding box, resized to 64 px tall (32 px rendered) with LANCZOS, and pasted at
x = 72 (36 px rendered). The bounding box starts at the T's crossbar, so x = 72 IS the T's left edge.

THE TAGLINE. "Collect once, comply everywhere." in Atkinson Hyperlegible Next Regular, the site's body font,
from the committed static TTF in scripts/fonts/ (OFL, licence alongside; downloaded once from
github.com/googlefonts/atkinson-hyperlegible-next at commit 7925f50, never fetched at run time). 28 px (14 px
rendered), ON_DARK #EAEDEE (lib/brand.ts). Its INK edge, not its pen position, sits on the T's left edge:
the tagline is rendered to a mask first and its first column at half strength or more is put on x = 72, because
font.getbbox reports the C's edge at the pen while its rounded stroke reaches full weight a pixel later (measured
1 Oct 2026: T at 72, C at 73 when placed by getbbox). 14 px below the logo. Logo and tagline are centred as one
group.

CONTRAST. Measured before the text is drawn, as the token file measures the closing bands: every pixel of the
background inside the tagline's ink box, the lowest WCAG ratio against #EAEDEE. The build FAILS below 4.5:1.

OUTPUT. JPEG, quality 85, progressive, optimised.
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
FONT = ROOT / 'scripts/fonts/AtkinsonHyperlegibleNext-Regular.ttf'
TAGLINE = 'Collect once, comply everywhere.'
TAGLINE_SIZE = 28
TAGLINE_GAP = 14
ON_DARK = (0xEA, 0xED, 0xEE)   # lib/brand.ts ON_DARK
PHOTO = ROOT / 'public/home/hero-aurora.jpg'
LOGO = ROOT / 'logo/themisiq-logo-reversed.png'
OUT = ROOT / 'public/images/email/masthead.jpg'

CROP = (140, 985, 2640, 1485)
SIZE = (1200, 240)
LOGO_BG = (17, 25, 39)
LOGO_HEIGHT = 64
LOGO_X = 72


def keyed_logo() -> Image.Image:
    src = Image.open(LOGO).convert('RGB')
    w, h = src.size
    px = src.load()
    out = Image.new('RGBA', (w, h))
    opx = out.load()
    for y in range(h):
        for x in range(w):
            p = px[x, y]
            a = max((p[i] - LOGO_BG[i]) / (255 - LOGO_BG[i]) for i in range(3))
            a = min(max(a, 0.0), 1.0)
            if a == 0:
                opx[x, y] = (0, 0, 0, 0)
                continue
            c = tuple(min(max(round((p[i] - (1 - a) * LOGO_BG[i]) / a), 0), 255) for i in range(3))
            opx[x, y] = (*c, round(a * 255))
    bbox = out.getchannel('A').getbbox()
    out = out.crop(bbox)
    width = round(out.width * LOGO_HEIGHT / out.height)
    return out.resize((width, LOGO_HEIGHT), Image.LANCZOS)


def luminance(rgb) -> float:
    c = [v / 255 for v in rgb]
    c = [v / 12.92 if v <= 0.03928 else ((v + 0.055) / 1.055) ** 2.4 for v in c]
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]


def contrast(a, b) -> float:
    la, lb = sorted((luminance(a), luminance(b)), reverse=True)
    return (la + 0.05) / (lb + 0.05)


def main() -> None:
    photo = Image.open(PHOTO).convert('RGB')
    assert photo.size == (2640, 1485), f'hero-aurora.jpg is {photo.size}; the crop box was measured on 2640 x 1485'
    band = photo.crop(CROP).resize(SIZE, Image.LANCZOS).convert('RGBA')
    logo = keyed_logo()
    font = ImageFont.truetype(str(FONT), TAGLINE_SIZE)
    left, top, right, bottom = font.getbbox(TAGLINE)          # ink box relative to the pen position
    # The tagline's visible left edge: render it alone and find the first column at half strength or more.
    mask = Image.new('L', (right + 8, bottom + 8))
    ImageDraw.Draw(mask).text((4, 4), TAGLINE, font=font, fill=255)
    solid = mask.point(lambda v: 255 if v >= 128 else 0).getbbox()
    visible_left = solid[0] - 4                               # relative to the pen position
    group_h = logo.height + TAGLINE_GAP + (bottom - top)
    logo_y = (SIZE[1] - group_h) // 2
    ink_x, ink_y = LOGO_X, logo_y + logo.height + TAGLINE_GAP  # where the tagline's visible ink starts
    left = visible_left

    # Contrast, before drawing: the lowest ratio over every background pixel inside the ink box.
    behind = band.convert('RGB').crop((ink_x, ink_y, ink_x + (right - left), ink_y + (bottom - top)))
    pixels = list(behind.getdata())
    worst = min(pixels, key=lambda p: contrast(ON_DARK, p))
    mean = tuple(round(sum(p[i] for p in pixels) / len(pixels)) for i in range(3))
    lowest = contrast(ON_DARK, worst)
    print(f'tagline background: mean #{mean[0]:02X}{mean[1]:02X}{mean[2]:02X} ({contrast(ON_DARK, mean):.2f}:1), '
          f'lightest #{worst[0]:02X}{worst[1]:02X}{worst[2]:02X} ({lowest:.2f}:1, the lowest)')
    assert lowest >= 4.5, f'the tagline would be {lowest:.2f}:1 on its lightest pixel; 4.5:1 is the floor'

    band.alpha_composite(logo, (LOGO_X, logo_y))
    ImageDraw.Draw(band).text((ink_x - left, ink_y - top), TAGLINE, font=font, fill=(*ON_DARK, 255))
    OUT.parent.mkdir(parents=True, exist_ok=True)
    band.convert('RGB').save(OUT, 'JPEG', quality=85, progressive=True, optimize=True)
    print(f'{OUT.relative_to(ROOT)}: {SIZE[0]} x {SIZE[1]}, logo {logo.width} x {logo.height} at ({LOGO_X}, {logo_y}), '
          f'tagline ink at ({ink_x}, {ink_y}) {right - left} x {bottom - top}, {OUT.stat().st_size / 1024:.1f} KB')


if __name__ == '__main__':
    main()
