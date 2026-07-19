#!/usr/bin/env python3
# Turn the Falchi World Atlas 2015 raster (artificial sky brightness, mcd/m^2)
# into: a region overlay PNG, a bounds+legend JSON, and a Bortle value written
# onto every spot. Runs on a runner with python3-gdal + numpy (from gdal-bin).
#
# Data: New World Atlas of Artificial Night Sky Brightness (Falchi et al. 2016),
# GFZ Data Services, DOI 10.5880/GFZ.1.4.2016.001, CC BY-NC 4.0.
#
# Usage: build-light-pollution.py <region.tif> <spots.json> <out.png> <out.json> <YYYY-MM-DD>

import sys, json
import numpy as np
from osgeo import gdal

region_tif, spots_path, out_png, out_json, built = sys.argv[1:6]

NAT = 0.174  # natural night-sky brightness, mcd/m^2 (~21.98 mag/arcsec^2)

# Artificial brightness (mcd/m^2) -> total sky mag/arcsec^2.
def to_mag(artificial):
    total_cd = (NAT + np.maximum(artificial, 0.0)) * 1e-3  # cd/m^2
    return -2.5 * np.log10(total_cd / 1.08e5)

# SQM (mag/arcsec^2) -> Bortle class 1..9 (darker sky = higher mag = lower Bortle).
# Ascending mag edges; classes chosen from the widely-used SQM/Bortle table.
_MAG_EDGES = np.array([17.8, 18.0, 18.5, 19.1, 20.4, 21.3, 21.5, 21.7])
_BORTLE    = np.array([9,    8,    7,    6,    5,    4,    3,    2,   1])  # len = edges+1
def to_bortle(mag):
    idx = np.digitize(mag, _MAG_EDGES)  # 0..8
    return _BORTLE[idx]

# Bortle -> RGBA for the overlay. Luminance climbs with light pollution so the
# meaning survives grayscale; the legend also labels every class in text.
_RAMP = {
    1: (12, 24, 64), 2: (26, 52, 120), 3: (30, 96, 150), 4: (36, 148, 120),
    5: (150, 170, 40), 6: (208, 150, 30), 7: (214, 96, 30), 8: (224, 74, 54), 9: (245, 240, 235),
}
BORTLE_LABEL = {
    1: 'Bortle 1 — pristine', 2: 'Bortle 2 — truly dark', 3: 'Bortle 3 — rural',
    4: 'Bortle 4 — rural/suburban', 5: 'Bortle 5 — suburban', 6: 'Bortle 6 — bright suburban',
    7: 'Bortle 7 — suburban/urban', 8: 'Bortle 8 — city', 9: 'Bortle 9 — inner city',
}

ds = gdal.Open(region_tif)
gt = ds.GetGeoTransform()
band = ds.GetRasterBand(1)
arr = band.ReadAsArray().astype('float64')
nod = band.GetNoDataValue()
mask = np.zeros(arr.shape, bool) if nod is None else (arr == nod)

mag = to_mag(arr)
bortle = to_bortle(mag).astype('int16')
h, w = bortle.shape

# --- overlay PNG (RGBA, semi-transparent) ---
rgba = np.zeros((4, h, w), 'uint8')
for b, (r, g, bl) in _RAMP.items():
    sel = (bortle == b) & (~mask)
    rgba[0][sel] = r; rgba[1][sel] = g; rgba[2][sel] = bl; rgba[3][sel] = 175
mem = gdal.GetDriverByName('MEM').Create('', w, h, 4, gdal.GDT_Byte)
for i in range(4):
    mem.GetRasterBand(i + 1).WriteArray(rgba[i])
gdal.GetDriverByName('PNG').CreateCopy(out_png, mem)

# --- bounds + legend JSON ---
west = gt[0]; north = gt[3]
east = west + gt[1] * w; south = north + gt[5] * h
present = sorted(int(b) for b in np.unique(bortle[~mask]))
layer = {
    'source': 'Falchi et al. 2016, New World Atlas of Artificial Night Sky Brightness',
    'license': 'CC BY-NC 4.0',
    'attribution': 'Falchi, F. et al. (2016), GFZ Data Services, doi:10.5880/GFZ.1.4.2016.001',
    'builtAt': built,
    'bounds': {'south': south, 'west': west, 'north': north, 'east': east},
    'legend': [{'bortle': b, 'label': BORTLE_LABEL[b],
                'color': '#%02x%02x%02x' % _RAMP[b]} for b in range(1, 10)],
    'present': present,
}
with open(out_json, 'w') as f:
    json.dump(layer, f, indent=2)

# --- tag every spot with its Bortle ---
inv = gdal.InvGeoTransform(gt)
def bortle_at(lat, lng):
    px = int(inv[0] + inv[1] * lng + inv[2] * lat)
    py = int(inv[3] + inv[4] * lng + inv[5] * lat)
    if 0 <= px < w and 0 <= py < h and not mask[py, px]:
        return int(bortle[py, px])
    return None

with open(spots_path) as f:
    doc = json.load(f)
tagged = 0
for s in doc['spots']:
    b = bortle_at(s['lat'], s['lng'])
    if b is not None:
        s.setdefault('tags', {})['bortle'] = b
        tagged += 1
with open(spots_path, 'w') as f:
    json.dump(doc, f, indent=2)
    f.write('\n')

# --- sanity check to the log ---
def probe(name, lat, lng):
    b = bortle_at(lat, lng)
    print(f'  {name}: Bortle {b}')
print(f'tagged {tagged}/{len(doc["spots"])} spots; Bortle classes present: {present}')
print('sanity (expect city~7-8, Sierra~2-4):')
probe('Downtown Sacramento', 38.5816, -121.4944)
probe('Auburn', 38.8966, -121.0769)
probe('Desolation Wilderness edge', 38.86, -120.13)
