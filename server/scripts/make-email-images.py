# Builds the pictures in the "finish your profile" email from the store screenshots and the app icon.
# Usage: python3 scripts/make-email-images.py SHOTS_DIR ICON_PNG OUT_DIR
# No words in the pictures, so one set works for every language; the email's text sits around them.
import sys
from PIL import Image, ImageDraw, ImageFilter
D, ICON, OUT = sys.argv[1], sys.argv[2], sys.argv[3]
BLUE, MID, BLUE2, INK = (59, 91, 219), (69, 99, 227), (92, 124, 250), (28, 29, 36)  # MID is #4563e3, where the banner ends

def phone(shot, w):
    """A screenshot in a dark phone frame with rounded corners, on a transparent background."""
    img = Image.open(f'{D}/{shot}').convert('RGB')
    h = round(w * img.height / img.width)
    b = round(w * 0.035)
    fr = Image.new('RGBA', (w + 2 * b, h + 2 * b), (0, 0, 0, 0))
    ImageDraw.Draw(fr).rounded_rectangle((0, 0, fr.width - 1, fr.height - 1), round(w * 0.13), fill=INK + (255,))
    scr = img.resize((w, h), Image.LANCZOS)
    m = Image.new('L', (w, h), 0); ImageDraw.Draw(m).rounded_rectangle((0, 0, w - 1, h - 1), round(w * 0.1), fill=255)
    fr.paste(scr, (b, b), m)
    return fr

def place(canvas, ph, x, y, angle=0, shadow=60):
    ph = ph.rotate(angle, resample=Image.BICUBIC, expand=True)
    pad = 80  # room for the blur, so the shadow fades out instead of stopping at a hard edge
    a = Image.new('L', (ph.width + 2 * pad, ph.height + 2 * pad), 0); a.paste(ph.getchannel('A').point(lambda v: shadow if v else 0), (pad, pad))
    sh = Image.new('RGBA', a.size, (20, 30, 90, 0)); sh.putalpha(a.filter(ImageFilter.GaussianBlur(26)))
    tmp = Image.new('RGBA', canvas.size, (0, 0, 0, 0)); tmp.paste(sh, (x + 10 - pad, y + 30 - pad)); canvas.alpha_composite(tmp)
    tmp = Image.new('RGBA', canvas.size, (0, 0, 0, 0)); tmp.paste(ph, (x, y)); canvas.alpha_composite(tmp)

def gradient(w, h, a, b):
    g = Image.new('RGBA', (w, h))
    px = g.load()
    for yy in range(h):
        for xx in range(w):
            t = yy / h  # top to bottom, so the top edge matches the banner above it in the email
            px[xx, yy] = tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3)) + (255,)
    return g

def blob(canvas, box, fill):
    layer = Image.new('RGBA', canvas.size, (0, 0, 0, 0)); ImageDraw.Draw(layer).ellipse(box, fill=fill); canvas.alpha_composite(layer)

def badge(canvas, cx, cy, r, color, shape):
    """A round white badge with a heart or a star, like the like and super-like buttons in the app."""
    layer = Image.new('RGBA', canvas.size, (0, 0, 0, 0)); d = ImageDraw.Draw(layer)
    d.ellipse((cx - r + 6, cy - r + 14, cx + r + 6, cy + r + 14), fill=(20, 30, 90, 70))
    layer = layer.filter(ImageFilter.GaussianBlur(8)); d = ImageDraw.Draw(layer)
    d.ellipse((cx - r, cy - r, cx + r, cy + r), fill=(255, 255, 255, 255))
    s = r * 0.5
    if shape == 'heart':
        d.ellipse((cx - s, cy - s * 0.75, cx, cy + s * 0.25), fill=color); d.ellipse((cx, cy - s * 0.75, cx + s, cy + s * 0.25), fill=color)
        d.polygon([(cx - s * 0.97, cy - s * 0.12), (cx + s * 0.97, cy - s * 0.12), (cx, cy + s * 0.95)], fill=color)
    else:
        import math
        pts = [(cx + (s if i % 2 == 0 else s * 0.45) * math.sin(i * math.pi / 5), cy - (s if i % 2 == 0 else s * 0.45) * math.cos(i * math.pi / 5)) for i in range(10)]
        d.polygon(pts, fill=color)
    canvas.alpha_composite(layer)

# Hero, 1200 x 760 (shown at 600 wide): two phones on the brand gradient. Families see an au pair's card in front,
# au pairs a family's.
for name, front, back in [('hero-family', '1-discover.png', '2-discover-aupair.png'), ('hero-aupair', '2-discover-aupair.png', '1-discover.png')]:
    c = gradient(1200, 760, MID, BLUE2)
    blob(c, (-160, 420, 420, 1000), (255, 255, 255, 22)); blob(c, (860, -220, 1400, 320), (255, 255, 255, 26)); blob(c, (520, 560, 760, 800), (255, 255, 255, 16))
    place(c, phone(back, 300), 180, 150, angle=8, shadow=70)
    place(c, phone(front, 340), 560, 40, angle=-5, shadow=90)
    badge(c, 470, 560, 54, (47, 179, 128), 'heart')
    badge(c, 1010, 170, 44, (63, 169, 245), 'star')
    badge(c, 1030, 620, 38, (255, 88, 100), 'heart')
    c.convert('RGB').save(f'{OUT}/{name}.jpg', quality=84, optimize=True, progressive=True)

# Swipe, match, chat: three phones in a row, 1200 x 700, on the site's light background.
c = Image.new('RGBA', (1200, 700), (255, 255, 255, 255))  # white, like the card it sits in
for i, shot in enumerate(['1-discover.png', '6-profile.png', '4-chat.png']):
    place(c, phone(shot, 290), 70 + i * 375, 40, shadow=45)
c.convert('RGB').save(f'{OUT}/swipe-match-chat.jpg', quality=82, optimize=True, progressive=True)

# The app icon with rounded corners, 128 px (shown at 48 px).
ic = Image.open(ICON).convert('RGB').resize((128, 128), Image.LANCZOS)
m = Image.new('L', (128, 128), 0); ImageDraw.Draw(m).rounded_rectangle((0, 0, 127, 127), 30, fill=255)
out = Image.new('RGBA', (128, 128), (0, 0, 0, 0)); out.paste(ic, (0, 0), m)
out.save(f'{OUT}/icon.png', optimize=True)
