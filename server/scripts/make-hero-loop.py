# Builds the landing-page hero loop from the store screenshots. Usage: make.py SHOTS_DIR OUT_RAW
import sys, math
from PIL import Image, ImageDraw, ImageFilter
D, OUT = sys.argv[1], sys.argv[2]
W, H, FPS = 540, 1170, 30
K = W / 1290
BG = (246, 247, 251)
def load(n): return Image.open(f'{D}/{n}').convert('RGB').resize((W, H), Image.LANCZOS)
def s(v): return round(v * K)
disc, chat, prof = load('1-discover.png'), load('4-chat.png'), load('6-profile.png')
ease = lambda t: t * t * (3 - 2 * t)
clamp = lambda t: max(0.0, min(1.0, t))
def prog(f, a, b): return clamp((f - a) / (b - a))

# Discover: lift the card out, leave an empty stage behind it.
cb = (s(36), s(144), s(1254), s(2372))
card = disc.crop(cb)
mask = Image.new('L', card.size, 0); ImageDraw.Draw(mask).rounded_rectangle((0, 0, card.size[0] - 1, card.size[1] - 1), s(56), fill=255)
card.putalpha(mask)
stage = disc.copy(); ImageDraw.Draw(stage).rectangle(cb, fill=BG)

def heart(size, color):
    im = Image.new('RGBA', (size, size)); d = ImageDraw.Draw(im)
    pts = []
    for i in range(200):
        t = i / 200 * 2 * math.pi
        x = 16 * math.sin(t) ** 3; y = 13 * math.cos(t) - 5 * math.cos(2 * t) - 2 * math.cos(3 * t) - math.cos(4 * t)
        pts.append((size / 2 + x * size / 36, size / 2 - y * size / 36 - size * .04))
    d.polygon(pts, fill=color); return im
stamp = heart(s(300), (47, 179, 128, 255))
big = heart(s(560), (255, 255, 255, 255))
# Gradient for the match flash, brand blues.
grad = Image.new('RGB', (W, H)); gd = ImageDraw.Draw(grad)
for y in range(H):
    t = y / H; gd.line((0, y, W, y), fill=(round(59 + (92 - 59) * t), round(91 + (124 - 91) * t), round(219 + (250 - 219) * t)))

# Like button pulse.
hb = (s(860) - s(115), s(2507) - s(115), s(860) + s(115), s(2507) + s(115))
btn = disc.crop(hb)

# Chat: hide both bubbles, then reveal them.
m1, m2 = (0, s(222), W, s(458)), (0, s(462), W, s(700))
b1, b2 = chat.crop(m1), chat.crop(m2)
chat0 = chat.copy(); ImageDraw.Draw(chat0).rectangle((0, s(222), W, s(700)), fill=BG)
# Profile: hide the "why you match" ticks, then reveal them one by one.
rows = [(2356, 2408), (2428, 2480), (2500, 2552), (2572, 2624), (2644, 2694)]
pbg = prof.getpixel((W - s(60), s(2420)))
prof0 = prof.copy()
for a, b in rows: ImageDraw.Draw(prof0).rectangle((s(30), s(a), W - s(30), s(b)), fill=pbg)

def reveal(base, piece, box, t, rise):
    if t <= 0: return
    t = ease(t)
    p = piece.copy(); p.putalpha(round(255 * t))
    base.paste(p, (box[0], box[1] + round(rise * (1 - t))), p)

def frame(f):
    if f < 108 or f >= 300:
        fr = stage.copy()
        g = f - 300 if f >= 300 else f
        if f >= 300 or f < 60:
            # pulse the like button just before the swipe
            pt = prog(f, 44, 60); sc = 1 + .18 * math.sin(math.pi * pt) if f < 60 else 1
            fr.paste(card, cb[:2], card)
            if sc != 1:
                bs = btn.resize((round(btn.width * sc), round(btn.height * sc)), Image.LANCZOS)
                fr.paste(bs, (hb[0] - (bs.width - btn.width) // 2, hb[1] - (bs.height - btn.height) // 2))
            else: fr.paste(btn, hb[:2])
            if f >= 300:  # cross-fade from the profile back into the loop start
                return Image.blend(frame_profile(299), fr, ease(prog(f, 300, 330)))
            return fr
        t = prog(f, 60, 80); e = t * t
        c = card.rotate(-22 * e, resample=Image.BICUBIC, expand=True)
        st = stamp.copy(); st.putalpha(st.getchannel('A').point(lambda v: round(v * min(1, t * 3))))
        cc = card.copy(); cc.paste(st, (s(80), s(120)), st)
        c = cc.rotate(-22 * e, resample=Image.BICUBIC, expand=True)
        x = cb[0] + round(e * W * 1.25) - (c.width - card.width) // 2; y = cb[1] + round(e * s(160)) - (c.height - card.height) // 2
        fr.paste(c, (x, y), c)
        # match flash
        if f >= 78:
            a = ease(prog(f, 78, 88)); fr = Image.blend(fr, grad, a)
            t2 = prog(f, 80, 96); sc = 0.2 + 0.95 * ease(t2) - 0.15 * ease(prog(f, 92, 100))
            hb2 = big.resize((max(1, round(big.width * sc)),) * 2, Image.LANCZOS)
            fr.paste(hb2, ((W - hb2.width) // 2, (H - hb2.height) // 2), hb2)
        return fr
    if f < 210:
        fr = chat0.copy()
        reveal(fr, b1, m1, prog(f, 126, 138), s(40)); reveal(fr, b2, m2, prog(f, 160, 172), s(40))
        if f < 120:
            ov = grad.copy(); hb2 = big.resize((round(big.width),) * 2); ov.paste(hb2, ((W - hb2.width) // 2, (H - hb2.height) // 2), hb2)
            fr = Image.blend(ov, fr, ease(prog(f, 106, 120)))
        return fr
    return frame_profile(f)

def frame_profile(f):
    fr = prof0.copy()
    for i, (a, b) in enumerate(rows):
        box = (s(30), s(a), W - s(30), s(b))
        reveal(fr, prof.crop(box), box, prog(f, 232 + i * 9, 242 + i * 9), s(18))
    t = ease(prog(f, 210, 226))
    if t < 1:
        prev = frame(209); out = Image.new('RGB', (W, H))
        out.paste(prev, (-round(W * t), 0)); out.paste(fr, (round(W * (1 - t)), 0)); return out
    return fr

with open(OUT, 'wb') as o:
    for f in range(330): o.write(frame(f).tobytes())
frame(0).save(OUT + '.poster.png')
