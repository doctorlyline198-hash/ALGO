from pathlib import Path
from PIL import Image

# ASCII ramp to help visualize relative brightness; use digits for clarity.
ASCII_CHARS = "0123456789"
IMAGE_PATH = (
    Path(__file__).resolve().parent
    / "client"
    / "test-results"
    / "app-UI-stress-smoke-tests--dd54e-ash-emits-no-console-errors"
    / "test-failed-1.png"
)

img = Image.open(IMAGE_PATH)
print(f"Loaded {IMAGE_PATH} -> {img.size} mode={img.mode}")
gray = img.convert("L")
min_px, max_px = gray.getextrema()
print("Gray extrema:", (min_px, max_px))
if max_px > min_px:
    gray = gray.point(lambda v: int((v - min_px) * 255 / (max_px - min_px)))
width = 120
w, h = img.size
aspect_ratio = h / w
new_height = int(aspect_ratio * width * 0.55)
img = img.resize((width, max(1, new_height)))
pixels = list(gray.getdata())
rows = [pixels[i : i + width] for i in range(0, len(pixels), width)]
for row in rows[:60]:
    line = ''.join(ASCII_CHARS[p * (len(ASCII_CHARS) - 1) // 255] for p in row)
    print(line)
