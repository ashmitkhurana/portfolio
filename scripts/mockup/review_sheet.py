"""Build side-by-side comparison sheets: clean crop | review overlay.
Usage: python review_sheet.py <out_dir>
"""
import os, sys
from PIL import Image, ImageDraw, ImageFont
from guides_overlay import WINDOWS

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
SRC = os.path.join(ROOT, 'docs/ribbon/ref/ak-signature-cutout.webp')
NAMES = ['apex', 'farleft', 'scurve', 'bottomk', 'wrap', 'junction', 'topk', 'endstrand']
GAP = 12
HEADER_H = 44
HEADER_BG = (17, 17, 17)  # #111
HEADER_TEXT_COLOR = (255, 255, 255)

def font(sz):
    try:
        return ImageFont.truetype('/System/Library/Fonts/Menlo.ttc', sz)
    except Exception:
        return ImageFont.load_default()

def make_sheet(out_dir, name):
    """Build sheet_<name>.png: clean crop (left 3×) | review overlay (right)."""
    window = WINDOWS[name]
    x0, y0, x1, y1 = window
    w, h = x1 - x0, y1 - y0

    # Load cutout, composite over black
    cutout = Image.open(SRC).convert('RGBA')
    bg = Image.new('RGBA', cutout.size, (0, 0, 0, 255))
    bg.alpha_composite(cutout)

    # Clean crop at 3×
    clean = bg.crop(window).resize((w * 3, h * 3), Image.LANCZOS).convert('RGB')

    # Load review overlay
    review_path = os.path.join(out_dir, f'review_{name}.png')
    review = Image.open(review_path).convert('RGB')

    # Build side-by-side
    total_w = clean.width + GAP + review.width
    total_h = max(clean.height, review.height)
    sheet_h = HEADER_H + total_h
    sheet = Image.new('RGB', (total_w, sheet_h), HEADER_BG)

    # Composite images on sheet (below header)
    sheet.paste(clean, (0, HEADER_H))
    sheet.paste(review, (clean.width + GAP, HEADER_H))

    # Draw header
    d = ImageDraw.Draw(sheet)
    header_text = f"{name}: mockup (left) | trace: magenta = edge 1, green = edge 2, dashed = hidden, yellow dotted = roll outline (not an edge)"
    f = font(22)
    d.text((10, 11), header_text, fill=HEADER_TEXT_COLOR, font=f)

    # Save
    out_path = os.path.join(out_dir, f'sheet_{name}.png')
    sheet.save(out_path)
    print(f"saved {out_path}")

def make_overview_sheet(out_dir):
    """Build sheet_overview.png: clean cutout [0-852, 500-1846] 1× | review_overview.png."""
    # Load cutout, composite over black
    cutout = Image.open(SRC).convert('RGBA')
    bg = Image.new('RGBA', cutout.size, (0, 0, 0, 255))
    bg.alpha_composite(cutout)

    # Crop overview region at 1×
    clean = bg.crop((0, 500, 852, 1846)).convert('RGB')

    # Load review overview
    review_path = os.path.join(out_dir, 'review_overview.png')
    review = Image.open(review_path).convert('RGB')

    # Build side-by-side
    total_w = clean.width + GAP + review.width
    total_h = max(clean.height, review.height)
    sheet_h = HEADER_H + total_h
    sheet = Image.new('RGB', (total_w, sheet_h), HEADER_BG)

    # Composite images on sheet (below header)
    sheet.paste(clean, (0, HEADER_H))
    sheet.paste(review, (clean.width + GAP, HEADER_H))

    # Draw header
    d = ImageDraw.Draw(sheet)
    header_text = "overview: mockup (left) | trace (right)"
    f = font(22)
    d.text((10, 11), header_text, fill=HEADER_TEXT_COLOR, font=f)

    # Save
    out_path = os.path.join(out_dir, 'sheet_overview.png')
    sheet.save(out_path)
    print(f"saved {out_path}")

def main():
    out_dir = sys.argv[1]
    os.makedirs(out_dir, exist_ok=True)
    for name in NAMES:
        make_sheet(out_dir, name)
    make_overview_sheet(out_dir)
    print('ok')

if __name__ == '__main__':
    main()
