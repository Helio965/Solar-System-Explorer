#!/usr/bin/env python3
"""
Procedural texture generator for Solar System Explorer.

Renders every planet and moon as an orthographic sphere projection
(albedo only, no lighting: the CSS layers add light, shadow and atmosphere).
Surfaces are built from 3D Perlin noise evaluated on the sphere itself, so
there are no seams or pole pinching.

Usage:
    pip install numpy pillow
    python3 tools/generate_textures.py            # everything
    python3 tools/generate_textures.py earth io   # only some bodies

Outputs (WebP):
    assets/planets/<id>.webp         large planet surfaces
    assets/planets/thumbs/<id>.webp  small lit spheres for the menu
    assets/moons/<id>.webp           moon surfaces
"""

import os
import sys

import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_PLANETS = os.path.join(ROOT, "assets", "planets")
OUT_THUMBS = os.path.join(OUT_PLANETS, "thumbs")
OUT_MOONS = os.path.join(ROOT, "assets", "moons")

PLANET_SIZE = int(os.environ.get("PLANET_SIZE", 2048))
MOON_SIZE = int(os.environ.get("MOON_SIZE", 320))
THUMB_SIZE = 96
# Camera sits slightly below the equator, so bands curve like an arch.
VIEW_TILT = np.radians(21.0)
# Saturn is seen from 38° above its ring plane (matches rotateX(52deg) in CSS).
VIEW_TILT_OVERRIDES = {"saturn": np.radians(-38.0)}


# ---------------------------------------------------------------- noise ----
class Perlin3:
    GRAD = np.array(
        [[1, 1, 0], [-1, 1, 0], [1, -1, 0], [-1, -1, 0],
         [1, 0, 1], [-1, 0, 1], [1, 0, -1], [-1, 0, -1],
         [0, 1, 1], [0, -1, 1], [0, 1, -1], [0, -1, -1]],
        dtype=np.float32,
    )

    def __init__(self, seed=7):
        rng = np.random.default_rng(seed)
        perm = rng.permutation(256)
        self.p = np.concatenate([perm, perm]).astype(np.int32)

    @staticmethod
    def _fade(t):
        return t * t * t * (t * (t * 6 - 15) + 10)

    def _grad(self, h, x, y, z):
        g = self.GRAD[h % 12]
        return g[:, 0] * x + g[:, 1] * y + g[:, 2] * z

    def noise(self, P):
        x, y, z = P[:, 0], P[:, 1], P[:, 2]
        xi0, yi0, zi0 = np.floor(x), np.floor(y), np.floor(z)
        xf = (x - xi0).astype(np.float32)
        yf = (y - yi0).astype(np.float32)
        zf = (z - zi0).astype(np.float32)
        xi = xi0.astype(np.int64) & 255
        yi = yi0.astype(np.int64) & 255
        zi = zi0.astype(np.int64) & 255
        u, v, w = self._fade(xf), self._fade(yf), self._fade(zf)
        p = self.p
        a = p[xi] + yi
        aa = p[a] + zi
        ab = p[a + 1] + zi
        b = p[xi + 1] + yi
        ba = p[b] + zi
        bb = p[b + 1] + zi
        n000 = self._grad(p[aa], xf, yf, zf)
        n100 = self._grad(p[ba], xf - 1, yf, zf)
        n010 = self._grad(p[ab], xf, yf - 1, zf)
        n110 = self._grad(p[bb], xf - 1, yf - 1, zf)
        n001 = self._grad(p[aa + 1], xf, yf, zf - 1)
        n101 = self._grad(p[ba + 1], xf - 1, yf, zf - 1)
        n011 = self._grad(p[ab + 1], xf, yf - 1, zf - 1)
        n111 = self._grad(p[bb + 1], xf - 1, yf - 1, zf - 1)
        x1 = n000 + u * (n100 - n000)
        x2 = n010 + u * (n110 - n010)
        x3 = n001 + u * (n101 - n001)
        x4 = n011 + u * (n111 - n011)
        y1 = x1 + v * (x2 - x1)
        y2 = x3 + v * (x4 - x3)
        return y1 + w * (y2 - y1)


PERLIN = Perlin3(seed=1977)


def fbm(P, octaves=5, freq=1.0, lac=2.0, gain=0.5, offset=0.0):
    total = np.zeros(len(P), dtype=np.float32)
    amp, norm = 1.0, 0.0
    Q = P * freq + offset
    for i in range(octaves):
        total += amp * PERLIN.noise(Q)
        norm += amp
        amp *= gain
        Q = Q * lac + 17.31 * (i + 1)
    return total / norm


def ridged(P, octaves=5, freq=1.0, offset=0.0):
    total = np.zeros(len(P), dtype=np.float32)
    amp, norm = 1.0, 0.0
    Q = P * freq + offset
    for i in range(octaves):
        total += amp * (1.0 - np.abs(PERLIN.noise(Q)))
        norm += amp
        amp *= 0.5
        Q = Q * 2.0 + 9.17 * (i + 1)
    return total / norm


def warp(P, strength=0.5, freq=1.0, octaves=3, seed=0.0):
    w = np.stack(
        [
            fbm(P, octaves, freq, offset=seed + 3.1),
            fbm(P, octaves, freq, offset=seed + 11.7),
            fbm(P, octaves, freq, offset=seed + 23.9),
        ],
        axis=1,
    )
    return P + strength * w


# -------------------------------------------------------------- helpers ----
def hexrgb(h):
    h = h.lstrip("#")
    return np.array([int(h[i:i + 2], 16) / 255.0 for i in (0, 2, 4)], dtype=np.float32)


def ramp(t, stops):
    """Vectorised colour ramp. stops = [(position, '#hex'), ...]."""
    pos = np.array([s[0] for s in stops], dtype=np.float32)
    cols = np.stack([hexrgb(s[1]) for s in stops])
    return np.stack([np.interp(t, pos, cols[:, c]) for c in range(3)], axis=1).astype(np.float32)


def smooth(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0.0, 1.0)
    return t * t * (3 - 2 * t)


def mix(a, b, t):
    t = np.asarray(t, dtype=np.float32)
    t = t[:, None] if t.ndim == 1 else t
    return a * (1 - t) + b * t


def unit(v):
    v = np.asarray(v, dtype=np.float32)
    return v / np.linalg.norm(v)


def latlon_vec(lat_deg, lon_deg):
    la, lo = np.radians(lat_deg), np.radians(lon_deg)
    return np.array([np.cos(la) * np.sin(lo), np.sin(la), np.cos(la) * np.cos(lo)], dtype=np.float32)


def craters(Q, col, count, rmin, rmax, seed, depth=0.35, rim=0.25, rays=0.0):
    """Darken floors, brighten rims. Radii are angular (radians)."""
    rng = np.random.default_rng(seed)
    shade = np.ones(len(Q), dtype=np.float32)
    for _ in range(count):
        c = unit(rng.normal(size=3))
        r = rmin * (rmax / rmin) ** (rng.random() ** 2.2)
        cosd = Q @ c
        near = cosd > np.cos(r * (2.6 if rays else 1.35))
        if not near.any():
            continue
        d = np.arccos(np.clip(cosd[near], -1, 1)) / r
        floor = 1.0 - depth * (1.0 - smooth(0.55, 1.0, d)) * (d < 1.0)
        ring = 1.0 + rim * np.exp(-((d - 1.0) / 0.12) ** 2)
        s = floor * ring
        if rays:
            s = s + rays * np.exp(-((d - 1.0) / 0.9) ** 2) * (d > 1.0)
        shade[near] *= s
    return col * shade[:, None]


def spot(lat, lon, lat0, lon0, rlat, rlon):
    """Soft elliptical mask in lat/lon space (degrees)."""
    dlon = (lon - lon0 + 180.0) % 360.0 - 180.0
    d = ((lat - lat0) / rlat) ** 2 + (dlon / rlon) ** 2
    return np.exp(-d * 2.2).astype(np.float32), d


# ------------------------------------------------------------- surfaces ----
def mercury(Q, lat, lon):
    n = fbm(Q, 6, 2.4)
    col = ramp(n * 0.5 + 0.5, [(0.0, "#46423e"), (0.45, "#77716a"), (0.7, "#958e85"), (1.0, "#b7afa4")])
    col = craters(Q, col, 260, 0.012, 0.16, seed=11, depth=0.2, rim=0.16, rays=0.1)
    fine = fbm(Q, 4, 22.0)
    return col * (0.92 + 0.12 * fine[:, None])


def venus(Q, lat, lon):
    W = warp(Q * np.array([1.0, 2.6, 1.0], np.float32), 0.9, 1.4, 4, seed=4.0)
    n = fbm(W, 6, 1.6)
    streak = np.sin(np.radians(lat) * 9.0 + n * 4.0) * 0.5 + 0.5
    t = 0.55 * (n * 0.5 + 0.5) + 0.45 * streak
    col = ramp(t, [(0.0, "#9c7740"), (0.35, "#c29b5c"), (0.6, "#d9ba80"), (0.85, "#ead3a2"), (1.0, "#f4e4bf")])
    return col


def earth(Q, lat, lon):
    W = warp(Q, 0.35, 1.3, 4, seed=1.0)
    c = fbm(W, 7, 1.55)
    land = smooth(0.035, 0.07, c)
    detail = fbm(Q, 5, 6.0, offset=40.0)
    aridity = smooth(0.55, 0.15, np.abs(np.abs(lat) - 24.0) / 30.0) * smooth(-0.1, 0.25, detail)
    land_col = ramp(detail * 0.5 + 0.5, [(0.0, "#24401f"), (0.45, "#34572a"), (0.7, "#55693a"), (1.0, "#7b7448")])
    desert = ramp(detail * 0.5 + 0.5, [(0.0, "#8f744a"), (1.0, "#c2a874")])
    land_col = mix(land_col, desert, aridity * 0.85)
    depth = smooth(0.07, -0.25, c)
    ocean = mix(hexrgb("#1a5a93")[None, :], hexrgb("#0a2a57")[None, :], depth)
    col = mix(ocean, land_col, land)
    ice = smooth(68.0, 76.0, np.abs(lat) + 6.0 * fbm(Q, 4, 4.0, offset=70.0))
    col = mix(col, hexrgb("#e9eef2")[None, :], ice)
    # Clouds: stretched along longitude, swirled
    CW = warp(Q * np.array([1.0, 2.2, 1.0], np.float32), 0.55, 1.8, 4, seed=9.0)
    cl = fbm(CW, 7, 2.1, offset=55.0)
    cover = smooth(0.0, 0.42, cl) * 0.92
    col = mix(col, hexrgb("#f2f5f7")[None, :], cover)
    return col


def mars(Q, lat, lon):
    W = warp(Q, 0.4, 1.2, 4, seed=2.0)
    n = fbm(W, 7, 1.8)
    col = ramp(n * 0.5 + 0.5, [(0.0, "#4e2416"), (0.32, "#7f3520"), (0.52, "#a9502b"), (0.72, "#c46c41"), (1.0, "#dc9566")])
    dark = smooth(-0.05, -0.32, fbm(Q, 5, 1.1, offset=33.0))
    col = mix(col, hexrgb("#3b1f15")[None, :], dark * 0.7)
    col = craters(Q, col, 140, 0.01, 0.08, seed=21, depth=0.18, rim=0.12)
    cap = smooth(76.0, 82.0, lat + 4.0 * fbm(Q, 4, 5.0, offset=80.0))
    col = mix(col, hexrgb("#f1e4da")[None, :], cap)
    return col


JUPITER_BANDS = [
    (-90, "#6e6963"), (-62, "#8b8274"), (-48, "#ad9a7d"), (-38, "#d2c09f"),
    (-28, "#9c6b48"), (-19, "#e3d5bd"), (-9, "#c09572"), (-2, "#eadac0"),
    (5, "#e5d2b3"), (9, "#a8734c"), (15, "#8f5a3b"), (20, "#b98b63"),
    (25, "#e6d6ba"), (31, "#b18a66"), (38, "#d7c4a2"), (46, "#a28c70"),
    (56, "#c2b092"), (66, "#8d8476"), (90, "#6a6560"),
]


def jupiter(Q, lat, lon):
    W = warp(Q * np.array([1.0, 3.2, 1.0], np.float32), 0.22, 2.2, 4, seed=5.0)
    turb = fbm(W, 6, 2.6)
    lw = lat + 5.5 * turb + 1.6 * np.sin(np.radians(lon) * 6.0 + turb * 3.0)
    col = ramp(lw, JUPITER_BANDS)
    fine = np.sin(np.radians(lw) * 160.0 + 3.0 * fbm(Q, 3, 9.0, offset=12.0))
    col = col * (0.975 + 0.03 * fine[:, None])
    # Great (red) spot, swirled
    m, d = spot(lat, lon, 22.0, 40.0, 5.2, 11.0)
    swirl = fbm(Q, 4, 14.0, offset=91.0)
    red = ramp(np.clip(d + 0.25 * swirl, 0, 1.4), [(0.0, "#b5502f"), (0.5, "#c86d45"), (1.0, "#d9a27c"), (1.4, "#e2c9a8")])
    col = mix(col, red, smooth(1.6, 0.6, d))
    ring = np.exp(-((d - 1.05) / 0.18) ** 2)
    col = mix(col, hexrgb("#f1e6d2")[None, :], ring * 0.45)
    # A few white ovals
    for la, lo in [(-34, -60), (-34, 40), (-34, 120), (41, -120), (41, 100)]:
        mm, _ = spot(lat, lon, la, lo, 1.6, 3.4)
        col = mix(col, hexrgb("#f3ece0")[None, :], mm * 0.8)
    return col


def saturn(Q, lat, lon):
    W = warp(Q * np.array([1.0, 3.0, 1.0], np.float32), 0.12, 2.0, 3, seed=6.0)
    turb = fbm(W, 5, 2.4)
    lw = lat + 3.0 * turb
    col = ramp(lw, [
        (-90, "#8f8670"), (-64, "#a99a77"), (-48, "#c7b183"), (-34, "#dcc595"),
        (-20, "#e6d1a2"), (-8, "#efdfb4"), (0, "#f1e2b8"), (8, "#e6cf9b"),
        (16, "#d3b67f"), (24, "#e3cc98"), (34, "#cfb685"), (46, "#dcc79b"),
        (58, "#b9a47c"), (72, "#9b927c"), (90, "#7f7f78"),
    ])
    fine = np.sin(np.radians(lw) * 120.0)
    return col * (0.985 + 0.018 * fine[:, None])


def uranus(Q, lat, lon):
    n = fbm(Q * np.array([1.0, 4.0, 1.0], np.float32), 4, 1.4)
    lw = lat + 4.0 * n
    col = ramp(lw, [(-90, "#4f8f97"), (-30, "#5f9fa6"), (0, "#6aabb0"), (35, "#72b3b6"), (65, "#86c4c3"), (90, "#9cd3cf")])
    return col * (0.99 + 0.012 * np.sin(np.radians(lw) * 26.0)[:, None])


def neptune(Q, lat, lon):
    W = warp(Q * np.array([1.0, 3.4, 1.0], np.float32), 0.3, 1.8, 4, seed=8.0)
    n = fbm(W, 6, 1.9)
    lw = lat + 6.0 * n
    col = ramp(lw, [(-90, "#2a2d78"), (-45, "#373f9c"), (-15, "#424cb2"), (5, "#4a56bd"),
                    (25, "#434eb0"), (50, "#3a4199"), (90, "#2e3280")])
    col = col * (0.9 + 0.18 * (n * 0.5 + 0.5))[:, None]
    # Bright methane streaks
    S = Q * np.array([1.0, 9.0, 1.0], np.float32)
    belt = np.maximum(smooth(16.0, 4.0, np.abs(lat - 38.0)), smooth(14.0, 4.0, np.abs(lat + 28.0)))
    streak = smooth(0.3, 0.58, fbm(S, 5, 1.6, offset=61.0)) * belt
    col = mix(col, hexrgb("#dfe6ff")[None, :], streak * 0.75)
    # Great dark spot + companion cloud
    m, d = spot(lat, lon, 24.0, -20.0, 5.0, 10.0)
    col = mix(col, hexrgb("#17205a")[None, :], smooth(1.3, 0.3, d) * 0.85)
    m2, d2 = spot(lat, lon, 29.0, -12.0, 1.6, 6.0)
    col = mix(col, hexrgb("#eef2ff")[None, :], m2 * 0.8)
    return col


def pluto(Q, lat, lon):
    W = warp(Q, 0.35, 1.5, 4, seed=3.0)
    n = fbm(W, 6, 2.0)
    col = ramp(n * 0.5 + 0.5, [(0.0, "#5b3a28"), (0.35, "#8c6446"), (0.6, "#b58e69"), (0.85, "#d2b48f"), (1.0, "#e6d2b6")])
    # Heart-shaped bright plain (two lobes)
    edge = 0.35 * fbm(Q, 4, 5.0, offset=17.0)
    h1, d1 = spot(lat, lon, 24.0, -4.0, 17.0, 19.0)
    h2, d2 = spot(lat, lon, 18.0, 16.0, 15.0, 17.0)
    heart = np.maximum(smooth(1.3, 0.4, d1 + edge), smooth(1.3, 0.4, d2 + edge) * 0.92)
    heart *= 0.8 + 0.2 * smooth(-0.2, 0.3, fbm(Q, 4, 6.0, offset=7.0))
    col = mix(col, hexrgb("#f2e7d6")[None, :], heart)
    # Dark reddish equatorial band
    dark, dd = spot(lat, lon, 2.0, -110.0, 14.0, 60.0)
    col = mix(col, hexrgb("#3e2219")[None, :], smooth(1.4, 0.4, dd) * 0.8)
    return craters(Q, col, 60, 0.01, 0.06, seed=31, depth=0.12, rim=0.08)


# ---------------------------------------------------------------- moons ----
def generic_moon(ramp_stops, crater_count=120, seed=1, feature=None, rays=0.12, depth=0.3, fine_freq=10.0):
    def fn(Q, lat, lon):
        W = warp(Q, 0.35, 1.4, 3, seed=seed * 1.7)
        n = fbm(W, 6, 1.9, offset=seed * 13.0)
        col = ramp(n * 0.5 + 0.5, ramp_stops)
        if feature:
            col = feature(Q, lat, lon, col)
        col = craters(Q, col, crater_count, 0.02, 0.22, seed=seed + 100, depth=depth, rim=0.22, rays=rays)
        return col * (0.94 + 0.08 * fbm(Q, 3, fine_freq, offset=seed)[:, None])
    return fn


def f_luna(Q, lat, lon, col):
    maria = smooth(0.02, -0.2, fbm(Q, 5, 1.2, offset=5.0))
    return mix(col, hexrgb("#4e4d4a")[None, :], maria * 0.85)


def f_io(Q, lat, lon, col):
    sp = smooth(0.42, 0.62, ridged(Q, 4, 3.0, offset=2.0))
    col = mix(col, hexrgb("#c46a26")[None, :], smooth(0.1, 0.5, fbm(Q, 4, 2.5, offset=8.0)) * 0.7)
    col = mix(col, hexrgb("#2e2018")[None, :], smooth(0.93, 0.98, ridged(Q, 3, 5.0, offset=4.0)) * 0.9)
    return mix(col, hexrgb("#f6efc2")[None, :], sp * 0.4)


def f_europa(Q, lat, lon, col):
    lines = smooth(0.965, 0.995, ridged(Q, 3, 2.6, offset=3.0))
    lines2 = smooth(0.97, 0.997, ridged(Q, 3, 4.1, offset=19.0))
    col = mix(col, hexrgb("#8f5b3c")[None, :], np.maximum(lines, lines2) * 0.85)
    return col


def f_ganymede(Q, lat, lon, col):
    grooves = smooth(0.0, 0.2, fbm(Q, 5, 1.4, offset=21.0))
    col = mix(col, hexrgb("#b4aa9a")[None, :], grooves * 0.7)
    cap = smooth(55, 75, np.abs(lat))
    return mix(col, hexrgb("#dcd8d2")[None, :], cap * 0.6)


def f_titan(Q, lat, lon, col):
    band = ramp(lat + 8.0 * fbm(Q, 3, 2.0), [(-90, "#b36f2a"), (-20, "#c98a3c"), (30, "#d79b4a"), (90, "#a9662a")])
    return mix(col, band, 0.85)


def f_enceladus(Q, lat, lon, col):
    stripes = smooth(0.94, 0.99, ridged(Q * np.array([1, 3, 1], np.float32), 2, 1.6, offset=7.0)) * smooth(-30, -60, lat)
    return mix(col, hexrgb("#7fb2cf")[None, :], stripes * 0.8)


def f_triton(Q, lat, lon, col):
    cap = smooth(-10, -35, lat + 8 * fbm(Q, 3, 3.0))
    col = mix(col, hexrgb("#e9c9bd")[None, :], cap * 0.75)
    melon = smooth(0.55, 0.8, ridged(Q, 4, 6.0, offset=2.0))
    return col * (1.0 - 0.12 * melon[:, None])


def f_charon(Q, lat, lon, col):
    pole = smooth(48, 75, lat + 10 * fbm(Q, 3, 3.0, offset=6.0))
    return mix(col, hexrgb("#6a3a2a")[None, :], pole * 0.85)


def f_oberon(Q, lat, lon, col):
    return col * (1.0 - 0.25 * smooth(0.15, 0.45, fbm(Q, 4, 2.0, offset=42.0)))[:, None]


MOONS = {
    "moon": generic_moon([(0, "#6e6c68"), (0.5, "#9a9790"), (1, "#c4c0b8")], 150, 1, f_luna),
    "phobos": generic_moon([(0, "#4a4038"), (0.5, "#6a5d52"), (1, "#8a7d70")], 60, 2, rays=0.0, depth=0.4),
    "deimos": generic_moon([(0, "#7a6e60"), (0.5, "#998c7c"), (1, "#b8ac9b")], 25, 3, rays=0.0, depth=0.15),
    "io": generic_moon([(0, "#c9a43e"), (0.5, "#e2c45a"), (1, "#f2e08f")], 0, 4, f_io, rays=0.0),
    "europa": generic_moon([(0, "#c9b9a0"), (0.5, "#e2d6c2"), (1, "#f3ece0")], 8, 5, f_europa, rays=0.0, depth=0.1),
    "ganymede": generic_moon([(0, "#5e564c"), (0.5, "#7f766a"), (1, "#a1998d")], 90, 6, f_ganymede),
    "callisto": generic_moon([(0, "#3a332c"), (0.5, "#544a40"), (1, "#6f655a")], 220, 7, rays=0.12, depth=0.08),
    "titan": generic_moon([(0, "#b9792f"), (0.5, "#d0913f"), (1, "#e2ac5e")], 0, 8, f_titan, rays=0.0),
    "rhea": generic_moon([(0, "#97928b"), (0.5, "#b9b4ac"), (1, "#d6d2cb")], 200, 9, rays=0.2),
    "enceladus": generic_moon([(0, "#d8e2e8"), (0.5, "#eaf1f5"), (1, "#fbfdfe")], 40, 10, f_enceladus, rays=0.0, depth=0.12),
    "miranda": generic_moon([(0, "#7c7a78"), (0.5, "#a3a09c"), (1, "#c7c4bf")], 60, 11, rays=0.0, depth=0.25),
    "titania": generic_moon([(0, "#77716a"), (0.5, "#9a948c"), (1, "#bdb7ae")], 140, 12, rays=0.15),
    "oberon": generic_moon([(0, "#5c524a"), (0.5, "#7a6e64"), (1, "#9a8f84")], 160, 13, f_oberon, rays=0.25),
    "triton": generic_moon([(0, "#a8948c"), (0.5, "#c9b5aa"), (1, "#e3d3c9")], 20, 14, f_triton, rays=0.0, depth=0.12),
    "proteus": generic_moon([(0, "#3f3c39"), (0.5, "#57534f"), (1, "#716c67")], 50, 15, rays=0.0, depth=0.4),
    "nereid": generic_moon([(0, "#6b6762"), (0.5, "#8a8580"), (1, "#a8a39d")], 30, 16, rays=0.0),
    "charon": generic_moon([(0, "#6f6a66"), (0.5, "#8f8a85"), (1, "#b1aca6")], 70, 17, f_charon, rays=0.1),
    "nix": generic_moon([(0, "#9e9a96"), (0.5, "#bcb8b3"), (1, "#d8d4cf")], 20, 18, rays=0.0, depth=0.2),
    "hydra": generic_moon([(0, "#8f8b87"), (0.5, "#aeaaa5"), (1, "#cbc7c2")], 20, 19, rays=0.0, depth=0.2),
}

PLANETS = {
    "mercury": mercury, "venus": venus, "earth": earth, "mars": mars,
    "jupiter": jupiter, "saturn": saturn, "uranus": uranus,
    "neptune": neptune, "pluto": pluto,
}


# ------------------------------------------------------------- renderer ----
def sphere_geometry(size, tilt):
    """Points on the visible hemisphere, rotated into planet coordinates."""
    c = (np.arange(size, dtype=np.float32) + 0.5) / size * 2.0 - 1.0
    u, v = np.meshgrid(c, c)
    r2 = u * u + v * v
    inside = r2 <= 1.0
    x = u[inside]
    y = -v[inside]
    z = np.sqrt(np.clip(1.0 - x * x - y * y, 0.0, 1.0))
    ct, st = np.cos(tilt), np.sin(tilt)
    qx = x
    qy = y * ct - z * st
    qz = y * st + z * ct
    Q = np.stack([qx, qy, qz], axis=1).astype(np.float32)
    lat = np.degrees(np.arcsin(np.clip(qy, -1, 1)))
    lon = np.degrees(np.arctan2(qx, qz))
    view = np.stack([x, y, z], axis=1)
    return inside, Q, lat, lon, view


def render(fn, size, tilt, chunk=400_000):
    inside, Q, lat, lon, view = sphere_geometry(size, tilt)
    out = np.empty((len(Q), 3), dtype=np.float32)
    for s in range(0, len(Q), chunk):
        e = s + chunk
        out[s:e] = fn(Q[s:e], lat[s:e], lon[s:e])
    return inside, np.clip(out, 0, 1), view


def save_surface(fn, size, tilt, path, limb=0.35, quality=86):
    inside, col, view = render(fn, size, tilt)
    # Gentle limb darkening gives the albedo map some roundness on its own.
    mu = view[:, 2]
    col = col * (1.0 - limb + limb * np.sqrt(mu))[:, None]
    img = np.zeros((size, size, 3), dtype=np.float32)
    img[inside] = col
    Image.fromarray((img * 255 + 0.5).astype(np.uint8), "RGB").save(path, "WEBP", quality=quality, method=6)


def save_thumb(fn, size, path, tilt=VIEW_TILT):
    ss = size * 3
    inside, col, view = render(fn, ss, tilt)
    L = unit([-0.55, 0.62, 0.56])
    lam = np.clip(view @ L, 0, 1)
    shade = 0.07 + 0.98 * lam ** 0.85
    col = col * shade[:, None]
    rgba = np.zeros((ss, ss, 4), dtype=np.float32)
    rgba[inside, :3] = col
    rgba[inside, 3] = 1.0
    img = Image.fromarray((rgba * 255 + 0.5).astype(np.uint8), "RGBA").resize((size, size), Image.LANCZOS)
    img.save(path, "WEBP", quality=92, method=6)


def main(selected):
    os.makedirs(OUT_PLANETS, exist_ok=True)
    os.makedirs(OUT_THUMBS, exist_ok=True)
    os.makedirs(OUT_MOONS, exist_ok=True)
    for name, fn in PLANETS.items():
        if selected and name not in selected:
            continue
        print("planet", name, flush=True)
        tilt = VIEW_TILT_OVERRIDES.get(name, VIEW_TILT)
        save_surface(fn, PLANET_SIZE, tilt, os.path.join(OUT_PLANETS, f"{name}.webp"))
        save_thumb(fn, THUMB_SIZE, os.path.join(OUT_THUMBS, f"{name}.webp"), tilt)
    for name, fn in MOONS.items():
        if selected and name not in selected:
            continue
        print("moon", name, flush=True)
        save_surface(fn, MOON_SIZE, 0.0, os.path.join(OUT_MOONS, f"{name}.webp"), limb=0.25, quality=88)


if __name__ == "__main__":
    main(set(sys.argv[1:]))
