#!/usr/bin/env python3
"""
Repack the SABOROSA character sheets into one small strip for the website.

Reads the game's own masters + frame JSON from ../saborosa/assets, pulls the
poses we need, aligns them on a shared baseline, and writes a single PNG.

Why repack at all: the three masters are 1.35 MB together, more than the whole
site's image folder, and 40 of the 45 frames in each are poses the site does
not use.

Alignment: frames are tightly cropped, so no two share a baseline. We align on
the BODY CENTROID the same way the game's spritesheet.js does (per-character
body-colour test), and bake the correction into the packed cell so the runtime
needs no alignment maths at all.

  python3 pack-walkers.py            # idle only (col 0) -> 5 frames/char
  python3 pack-walkers.py --throw    # idle + charged throw (cols 0,4-8)
"""
import json, os, sys
from PIL import Image

SRC = "/home/cmoryah/proj/saborosa/assets"
OUT = "/home/cmoryah/proj/saborosa-games/public/img/saborosa-walkers.png"

# name on the site, master stem, body-colour test (mirrors spritesheet.js bodyType)
CHARS = [
    ("tom",   "saborosa-elementos-tomato",   "red"),
    ("erkpa", "saborosa-elementos-eggplant", "tan"),
    ("juixy", "saborosa-elementos-laranja",  "yellow"),
]

# rows are directions, in sheet order
DIRS = ["down", "down_left", "left", "up_left", "up"]

POSES = [0]                      # col 0 = idle/rest
if "--throw" in sys.argv:
    POSES = [0, 4, 5, 6, 7, 8]   # idle + the charged throw


def body_test(kind):
    """Pick out the fruit's body, ignoring yellow fists / white teeth / outline.

    Sampled from the masters, the three bodies are:
      TOM   (241, 92, 94)   red
      ERKPA (200,187,155)   tan  <- NOT purple, and within 2/255 of the site's
                                    kraft --c6b79a, so he needs his own ground
      JUIXY (255,234,62)    yellow
    """
    if kind == "red":                                      # TOM
        return lambda r, g, b: r > 110 and r > g + 40 and r > b + 40
    if kind == "tan":                                      # ERKPA
        return lambda r, g, b: (r > 150 and g > 140 and b > 120
                                and abs(r - g) < 30 and r > b + 20)
    if kind == "yellow":                                   # JUIXY
        return lambda r, g, b: r > 140 and g > 70 and r > b + 60 and g > b + 30
    raise ValueError(kind)


def centroid_y(img, box, test):
    """Vertical centre of mass of the body colour, in px from the frame's TOP.

    The game uses the centroid rather than the lowest body pixel because an arm
    crossing in front of the body makes the lowest pixel sit too high.
    """
    x, y, w, h = box
    crop = img.crop((x, y, x + w, y + h)).convert("RGBA")
    px = crop.load()
    tot = n = 0
    for j in range(h):
        for i in range(w):
            r, g, b, a = px[i, j]
            if a > 128 and test(r, g, b):
                tot += j
                n += 1
    return (tot / n) if n else h * 0.5


def lowest_opaque(img, box):
    x, y, w, h = box
    crop = img.crop((x, y, x + w, y + h)).convert("RGBA")
    px = crop.load()
    for j in range(h - 1, -1, -1):
        for i in range(w):
            if px[i, j][3] > 128:
                return j
    return h - 1


def main():
    packs = []
    for name, stem, kind in CHARS:
        sheet = Image.open(f"{SRC}/{stem}-game.png").convert("RGBA")
        data = json.load(open(f"{SRC}/{stem}-sprites.json"))
        cols, rows = data["cols"], data["rows"]
        test = body_test(kind)

        frames = []
        for r in range(rows):
            for c in POSES:
                f = data["frames"][r * cols + c]
                box = (f["x"], f["y"], f["w"], f["h"])
                frames.append({
                    "dir": DIRS[r], "pose": c, "box": box,
                    "cy": centroid_y(sheet, box, test),
                    "low": lowest_opaque(sheet, box),
                })
        packs.append({"name": name, "sheet": sheet, "frames": frames})

    # ── one scale for every pack: never rescale a character to even it out ──
    # Two different alignments are needed and conflating them is the trap:
    #
    #   WITHIN a character, poses must not jump. The anchor has to be the body
    #   CENTROID, because in a throw pose an outstretched arm is the lowest
    #   pixel and bottom-aligning would shove the fruit upward. This is the
    #   same reasoning as the game's spritesheet.js.
    #
    #   BETWEEN characters, the three must stand on one ground line. TOM,
    #   ERKPA and JUIXY are different heights, so a shared centroid would bury
    #   the tall one and float the short one.
    #
    # So: shift each character down by its own centroid->feet distance,
    # measured on its idle poses.
    for p in packs:
        idle = [f for f in p["frames"] if f["pose"] == 0]
        p["drop"] = sum(f["low"] - f["cy"] for f in idle) / len(idle)

    above = max(f["cy"] + p["drop"] for p in packs for f in p["frames"])
    below = max(f["box"][3] - f["cy"] - p["drop"] for p in packs for f in p["frames"])
    cw = max(f["box"][2] for p in packs for f in p["frames"]) + 4
    ch = int(above + below) + 4
    cw += cw % 2
    ch += ch % 2
    baseline = int(above) + 2          # y of the shared GROUND line in a cell

    ncols = len(POSES) * len(DIRS)
    out = Image.new("RGBA", (cw * ncols, ch * len(packs)), (0, 0, 0, 0))

    for row, p in enumerate(packs):
        for i, f in enumerate(p["frames"]):
            x, y, w, h = f["box"]
            cell = p["sheet"].crop((x, y, x + w, y + h))
            dx = cw // 2 - w // 2                      # centre horizontally
            dy = baseline - int(round(f["cy"] + p["drop"]))
            out.alpha_composite(cell, (i * cw + dx, row * ch + dy))

    out.save(OUT)
    # flat-colour hand-drawn art quantizes almost losslessly
    q = out.quantize(colors=128, method=Image.FASTOCTREE)
    q.save(OUT, optimize=True)

    src_kb = sum(os.path.getsize(f"{SRC}/{s}-game.png") for _, s, _ in CHARS) / 1024
    print(f"{OUT}  {os.path.getsize(OUT)/1024:.1f} KB  (masters: {src_kb:.0f} KB)")
    print("\nPaste into public/js/walkers.js if these change:\n")
    print(f"const CELL = {{ w: {cw}, h: {ch} }};")
    print(f"// and in style.css: .yard__fruit/.deep__fruit are {cw}x{ch}px,")
    print(f"//   transform-origin: {cw // 2}px {baseline}px, .yard__shadow top: {baseline - 2}px")
    print(f"const ROWS = {[p['name'] for p in packs]};".replace("'", "'"))
    print(f"// columns, dir-major pose-minor: {DIRS} x poses {POSES}")


main()
