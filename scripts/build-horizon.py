#!/usr/bin/env python3
# build-horizon.py — measure each spot's REAL terrain horizon (not a flat 0°)
# and write an openness value + the E/W/S/N ridge angles onto the spot. This is
# the "can the low sun and the Milky Way actually clear the land here" layer.
#
# WHY A DEM AND NOT AN ELEVATION API: the sibling Clear Horizons app traces a
# horizon per site from Open-Meteo's /v1/elevation — but that meters ~600
# COORDINATES PER MINUTE (measured on-device, 2026-07-18). A radial trace is
# hundreds of coordinates per spot; ×2362 spots that is hours of hammering a
# free API. So here we do it the light-pollution way: pull a DEM raster once
# and sample it locally — no rate limit, fully reproducible, seconds not hours.
#
# DATA: Terrain Tiles (SRTM 1-arc-second, ~30 m), AWS Open Data
# `elevation-tiles-prod`, skadi/HGT format — public, no key, public-domain
# (SRTM is a NASA/USGS product). Fallback source documented in horizon.yml.
#
# GEOMETRY (ported from clear-horizons src/model/terrain.js): spherical earth
# R=6371 km; a ridge Δh above eye at ground distance d dips by earth curvature,
# partly offset by standard terrestrial refraction (k≈0.13 → R_eff=R/(1−k)):
#     alt = atan2(Δh − d²/(2·R_eff), d)
# The horizon at a bearing is the MAX apparent altitude over every point along
# the ray — nearer ground can out-block a distant ridge.
#
# HONESTY CAVEAT (baked into the UI copy): elevation models carry NO TREES or
# buildings. This measures the LAND horizon — a tree-ringed meadow reads more
# open than it shoots. Stated plainly in the popup.
#
# Usage: build-horizon.py <dem.vrt|dem.tif> <spots.json> <out.json> <YYYY-MM-DD>

import sys, json, math
import numpy as np
from osgeo import gdal

dem_path, spots_path, out_json, built = sys.argv[1:5]

R = 6371000.0          # earth radius, m
K = 0.13               # standard terrestrial refraction
R_EFF = R / (1 - K)
EYE_M = 2.0            # observer eye height above ground
OPEN_DEG = 6.0         # mean ridge height (°) that maps openness→0. THE ONE
                       # knob: under ~2° is a great open horizon, 2–5° workable,
                       # 6°+ blocked. The sanity probes below reveal the real
                       # regional spread — retune here if they bunch up.

# Ray fan: 24 azimuths × 24 log-spaced distances (dense near, sparse far).
AZIMUTHS = np.arange(0, 360, 15, dtype=float)          # 24 rays
DISTS = np.geomspace(150.0, 45000.0, 24)               # 150 m → 45 km
DIR_INDEX = {'n': 0, 'e': 6, 's': 12, 'w': 18}         # az 0/90/180/270

# --- DEM ---------------------------------------------------------------------
ds = gdal.Open(dem_path)
if ds is None:
    sys.exit(f'cannot open DEM: {dem_path}')
band = ds.GetRasterBand(1)
nodata = band.GetNoDataValue()
A = band.ReadAsArray().astype('float32')
if nodata is not None:
    A[A == nodata] = np.nan
# SRTM voids over water often read as very negative; treat extremes as nan.
A[A < -500] = np.nan
gt = ds.GetGeoTransform()          # (ox, px_w, 0, oy, 0, px_h<0)
H, W = A.shape
inv = gdal.InvGeoTransform(gt)


def sample(lat, lng):
    """Bilinear DEM elevation (m) at arrays of lat/lng; nan off-coverage."""
    fx = inv[0] + inv[1] * lng + inv[2] * lat
    fy = inv[3] + inv[4] * lng + inv[5] * lat
    x0 = np.floor(fx).astype(int); y0 = np.floor(fy).astype(int)
    tx = fx - x0; ty = fy - y0
    out = np.full(np.shape(lat), np.nan, dtype='float32')
    ok = (x0 >= 0) & (x0 < W - 1) & (y0 >= 0) & (y0 < H - 1)
    if np.any(ok):
        xi = x0[ok]; yi = y0[ok]; txi = tx[ok]; tyi = ty[ok]
        v00 = A[yi, xi];     v10 = A[yi, xi + 1]
        v01 = A[yi + 1, xi]; v11 = A[yi + 1, xi + 1]
        top = v00 * (1 - txi) + v10 * txi
        bot = v01 * (1 - txi) + v11 * txi
        out[ok] = top * (1 - tyi) + bot * tyi
    return out


def sample_one(lat, lng):
    v = sample(np.array([lat], float), np.array([lng], float))[0]
    return float(v) if np.isfinite(v) else None


def dest_points(lat, lon):
    """Vectorized spherical direct problem for the full AZ×DIST fan."""
    az = np.radians(AZIMUTHS)[:, None]                 # (24,1)
    d = (DISTS / R)[None, :]                            # (1,24)
    p1 = math.radians(lat); l1 = math.radians(lon)
    sinp1, cosp1 = math.sin(p1), math.cos(p1)
    sinp2 = sinp1 * np.cos(d) + cosp1 * np.sin(d) * np.cos(az)
    p2 = np.arcsin(np.clip(sinp2, -1, 1))
    l2 = l1 + np.arctan2(np.sin(az) * np.sin(d) * cosp1, np.cos(d) - sinp1 * sinp2)
    return np.degrees(p2), (np.degrees(l2) + 540) % 360 - 180   # each (24,24)


def horizon_for(lat, lng, site_elev):
    plat, plon = dest_points(lat, lng)                 # (24 az, 24 dist)
    elev = sample(plat, plon)                           # (24,24), may hold nan
    dh = elev - (site_elev + EYE_M)
    drop = (DISTS ** 2 / (2 * R_EFF))[None, :]
    alt = np.degrees(np.arctan2(dh - drop, DISTS[None, :]))
    alt = np.where(np.isfinite(alt), alt, -90.0)       # off-coverage = no block
    ray = alt.max(axis=1)                              # (24,) max angle per az
    openness = float(np.clip(1 - np.mean(np.clip(ray, 0, None)) / OPEN_DEG, 0, 1))
    return openness, ray


# --- tag every spot ----------------------------------------------------------
with open(spots_path) as f:
    doc = json.load(f)

tagged = 0
open_hist = []
for s in doc['spots']:
    site = sample_one(s['lat'], s['lng'])
    if site is None:
        continue
    openness, ray = horizon_for(s['lat'], s['lng'], site)
    s.setdefault('tags', {})['horizon'] = {
        'open': round(openness, 2),
        'n': round(float(ray[DIR_INDEX['n']]), 1),
        'e': round(float(ray[DIR_INDEX['e']]), 1),
        's': round(float(ray[DIR_INDEX['s']]), 1),
        'w': round(float(ray[DIR_INDEX['w']]), 1),
        'site_m': round(site),
    }
    tagged += 1
    open_hist.append(openness)

with open(spots_path, 'w') as f:
    json.dump(doc, f, indent=2)
    f.write('\n')

# --- a tiny layer manifest (provenance + a coverage summary, no geometry) ----
oh = np.array(open_hist) if open_hist else np.array([0.0])
layer = {
    'built': built,
    'source': 'Terrain Tiles (SRTM 1-arc-second), AWS Open Data — public domain',
    'method': 'radial DEM horizon trace, earth curvature + refraction k=0.13',
    'tagged': tagged,
    'open_median': round(float(np.median(oh)), 2),
    'note': 'Land horizon only — DEMs carry no trees or buildings.',
}
with open(out_json, 'w') as f:
    json.dump(layer, f, indent=2)
    f.write('\n')

# --- sanity to the log -------------------------------------------------------
def probe(name, lat, lng):
    site = sample_one(lat, lng)
    if site is None:
        print(f'  {name}: outside DEM coverage'); return
    openness, ray = horizon_for(lat, lng, site)
    print(f'  {name}: elev {round(site)} m, openness {openness:.2f}, '
          f'E {ray[6]:.1f}° W {ray[18]:.1f}° S {ray[12]:.1f}°')

print(f'tagged {tagged}/{len(doc["spots"])} spots; median openness {layer["open_median"]}')
print('sanity (expect valley floor ~open, deep canyon ~closed):')
probe('Downtown Sacramento (flat valley)', 38.5816, -121.4944)
probe('Auburn (foothills)', 38.8966, -121.0769)
probe('Emerald Bay overlook (Tahoe basin)', 38.9540, -120.1050)
probe('American River Canyon floor', 38.9160, -121.0230)
