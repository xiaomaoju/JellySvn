#!/usr/bin/env python3
"""Generate JellySvn app icon - stylized jellyfish with SVN theme."""

import math
import random
from PIL import Image, ImageDraw, ImageFilter

SIZE = 1024
CENTER = SIZE // 2
OUTPUT = "assets/icon.png"

random.seed(42)


def lerp_color(c1, c2, t):
    t = max(0.0, min(1.0, t))
    return tuple(int(a + (b - a) * t) for a, b in zip(c1, c2))


def draw_radial_gradient(img, cx, cy, radius, inner_color, outer_color):
    for y in range(max(0, cy - radius), min(SIZE, cy + radius)):
        for x in range(max(0, cx - radius), min(SIZE, cx + radius)):
            dist = math.sqrt((x - cx) ** 2 + (y - cy) ** 2)
            if dist <= radius:
                t = (dist / radius) ** 1.5
                color = lerp_color(inner_color, outer_color, t)
                existing = img.getpixel((x, y))
                # Alpha composite manually
                sa = color[3] / 255.0
                da = existing[3] / 255.0
                oa = sa + da * (1 - sa)
                if oa > 0:
                    r = int((color[0] * sa + existing[0] * da * (1 - sa)) / oa)
                    g = int((color[1] * sa + existing[1] * da * (1 - sa)) / oa)
                    b = int((color[2] * sa + existing[2] * da * (1 - sa)) / oa)
                    img.putpixel((x, y), (r, g, b, int(oa * 255)))


def draw_smooth_tentacle(img, start_x, start_y, length, amplitude, frequency,
                          phase, width, color, taper=0.7):
    """Draw a smooth flowing tentacle using bezier-like sine curves."""
    draw = ImageDraw.Draw(img)
    prev_x, prev_y = start_x, start_y

    for i in range(1, length):
        t = i / length
        # Sine wave with increasing amplitude toward bottom
        wave = amplitude * math.sin(frequency * i + phase) * (0.3 + t * 0.7)
        x = start_x + wave + (amplitude * 0.3 * math.sin(frequency * 0.5 * i + phase * 1.5))
        y = start_y + i

        # Tapering width
        w = max(1, int(width * (1.0 - t * taper)))

        # Fading alpha
        alpha = int(color[3] * (1.0 - t ** 0.6))
        c = (color[0], color[1], color[2], alpha)

        if w > 2:
            draw.ellipse([x - w, y - 1, x + w, y + 1], fill=c)
        else:
            draw.line([(prev_x, prev_y), (x, y)], fill=c, width=max(1, w * 2))

        prev_x, prev_y = x, y


def create_icon():
    img = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))

    # === Background rounded rect ===
    corner_radius = 220
    bg = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    ImageDraw.Draw(bg).rounded_rectangle(
        [16, 16, SIZE - 16, SIZE - 16],
        radius=corner_radius,
        fill=(12, 13, 24, 255),
    )
    img = Image.alpha_composite(img, bg)

    # Ambient glow - indigo center
    glow = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    draw_radial_gradient(glow, CENTER, CENTER - 40, 450,
                         (70, 80, 200, 40), (0, 0, 0, 0))
    img = Image.alpha_composite(img, glow)

    # Ambient glow - purple lower
    glow2 = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    draw_radial_gradient(glow2, CENTER, CENTER + 200, 320,
                         (120, 60, 200, 25), (0, 0, 0, 0))
    img = Image.alpha_composite(img, glow2)

    # === Jellyfish dome ===
    dome_cx, dome_cy = CENTER, 320
    dome_rx, dome_ry = 200, 170

    dome_layer = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    dd = ImageDraw.Draw(dome_layer)

    # Outer glow around dome
    dome_glow = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    draw_radial_gradient(dome_glow, dome_cx, dome_cy, dome_rx + 60,
                         (99, 102, 241, 60), (99, 102, 241, 0))
    img = Image.alpha_composite(img, dome_glow)

    # Draw dome with gradient (bottom-up: indigo → purple)
    for i in range(dome_ry, 0, -1):
        ratio = i / dome_ry
        t = 1.0 - ratio
        rx = int(dome_rx * math.sqrt(1 - (1 - ratio) ** 2.2))
        # Slightly squished ellipse for jellyfish bell shape
        top_squish = 0.85 if ratio > 0.7 else 1.0
        color = lerp_color((80, 90, 235, 210), (175, 90, 245, 190), t)
        dd.ellipse(
            [dome_cx - rx, dome_cy - int(i * top_squish),
             dome_cx + rx, dome_cy + int(i * 0.4)],
            fill=color,
        )

    img = Image.alpha_composite(img, dome_layer)

    # Dome rim (bottom edge highlight)
    rim = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    rd = ImageDraw.Draw(rim)
    for angle in range(0, 360):
        rad = math.radians(angle)
        x = dome_cx + int(dome_rx * 0.95 * math.cos(rad))
        y = dome_cy + int(25 * math.sin(rad)) + dome_ry * 0.35
        if 160 < angle < 380:
            alpha = int(50 * math.sin(math.radians((angle - 160) * 180 / 220)))
            rd.ellipse([x - 3, y - 2, x + 3, y + 2],
                       fill=(180, 200, 255, max(0, alpha)))
    rim = rim.filter(ImageFilter.GaussianBlur(radius=3))
    img = Image.alpha_composite(img, rim)

    # Glossy highlight
    hl = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    draw_radial_gradient(hl, dome_cx - 50, dome_cy - 60, 100,
                         (255, 255, 255, 90), (255, 255, 255, 0))
    img = Image.alpha_composite(img, hl)

    # Small bright spot
    hl2 = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    draw_radial_gradient(hl2, dome_cx - 65, dome_cy - 80, 35,
                         (255, 255, 255, 140), (255, 255, 255, 0))
    img = Image.alpha_composite(img, hl2)

    # === Tentacles ===
    tent_layer = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    base_y = dome_cy + int(dome_ry * 0.38)

    # Main flowing tentacles
    tentacles = [
        # (x_offset, length, amplitude, freq, phase, width, color)
        (-150, 260, 30, 0.035, 0.0, 10, (99, 102, 241, 160)),
        (-105, 310, 25, 0.030, 1.2, 12, (120, 120, 248, 150)),
        (-60,  340, 35, 0.028, 2.5, 14, (140, 100, 245, 160)),
        (-15,  360, 20, 0.032, 0.8, 15, (168, 85, 247, 170)),
        (30,   350, 28, 0.026, 3.8, 14, (150, 95, 246, 155)),
        (75,   320, 32, 0.033, 1.6, 13, (120, 110, 248, 150)),
        (120,  290, 22, 0.030, 4.2, 11, (99, 102, 241, 145)),
        (160,  250, 26, 0.035, 2.0, 9,  (140, 90, 245, 135)),
    ]

    for x_off, length, amp, freq, phase, width, color in tentacles:
        draw_smooth_tentacle(
            tent_layer,
            dome_cx + x_off, base_y,
            length, amp, freq, phase, width, color
        )

    # Thin trailing tendrils
    for _ in range(12):
        x_off = random.randint(-140, 140)
        length = random.randint(180, 300)
        amp = random.randint(15, 40)
        freq = random.uniform(0.025, 0.040)
        phase = random.uniform(0, 6.28)
        alpha = random.randint(60, 110)
        color = random.choice([
            (99, 102, 241, alpha),
            (140, 100, 245, alpha),
            (168, 85, 247, alpha),
        ])
        draw_smooth_tentacle(
            tent_layer,
            dome_cx + x_off, base_y + random.randint(0, 20),
            length, amp, freq, phase, random.randint(3, 6), color, taper=0.85
        )

    tent_layer = tent_layer.filter(ImageFilter.GaussianBlur(radius=1.5))
    img = Image.alpha_composite(img, tent_layer)

    # === Bioluminescent particles ===
    particles = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    for _ in range(30):
        px = dome_cx + random.randint(-160, 160)
        py = dome_cy + random.randint(-130, 80)
        pr = random.randint(4, 12)
        pa = random.randint(50, 120)
        pc = random.choice([
            (210, 220, 255, pa),
            (190, 200, 255, pa),
            (230, 210, 255, pa),
        ])
        draw_radial_gradient(particles, px, py, pr, pc, (pc[0], pc[1], pc[2], 0))
    img = Image.alpha_composite(img, particles)

    # === SVN branch symbol (subtle, inside dome) ===
    svn = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    sd = ImageDraw.Draw(svn)

    bc = (255, 255, 255, 50)
    bc_dot = (255, 255, 255, 70)
    bx = dome_cx + 10
    by = dome_cy - 20

    # Trunk
    sd.line([(bx, by - 55), (bx, by + 55)], fill=bc, width=5)
    # Left branch
    sd.line([(bx, by - 10), (bx - 45, by - 50)], fill=bc, width=4)
    # Right branch
    sd.line([(bx, by + 15), (bx + 45, by - 15)], fill=bc, width=4)

    # Node dots
    for nx, ny in [(bx, by - 55), (bx - 45, by - 50),
                    (bx + 45, by - 15), (bx, by + 55)]:
        sd.ellipse([nx - 7, ny - 7, nx + 7, ny + 7], fill=bc_dot)

    svn = svn.filter(ImageFilter.GaussianBlur(radius=1.5))
    img = Image.alpha_composite(img, svn)

    # === Subtle border ===
    border = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    ImageDraw.Draw(border).rounded_rectangle(
        [16, 16, SIZE - 16, SIZE - 16],
        radius=corner_radius,
        outline=(255, 255, 255, 18),
        width=2,
    )
    img = Image.alpha_composite(img, border)

    img.save(OUTPUT, "PNG")
    print(f"Saved: {OUTPUT} ({SIZE}x{SIZE})")


if __name__ == "__main__":
    create_icon()
