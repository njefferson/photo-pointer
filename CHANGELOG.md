# Changelog

Written for the person using the app. Newest first.

## 0.9.0 — 2026-07-19

**The region's roadside history, on the map.**

- Every **historical marker** and **California Historical Landmark** in the
  region is now a spot — the Gold Rush plaques, the pioneer monuments, the
  little brass markers you drive past. Tap one and jump straight to its full
  write-up on **HMdb** (the Historical Marker Database).
- These join the same map as everything else, so a marker that sits in a park
  with an open western horizon and dark skies rises in **Top spots** like any
  other layered place.
- Facts come from **Wikidata** (public domain / CC0); HMdb keeps its own
  content — we only link to it, never copy it.

## 0.8.0 — 2026-07-19

**Where the wildlife actually is — beyond birds.**

- eBird already tells you where the birds are. Now every spot also knows the
  **other** wildlife photographed nearby — mammals, reptiles, amphibians,
  insects — from openly-licensed iNaturalist records. Tap a place and see how
  many non-bird species people have actually shot there.
- **Top spots gains a "Wild subjects" filter.** A park that's a birding
  hotspot *and* a mammal-and-herp hotspot now rises to the top.
- Only research-grade records under open licenses (CC0, CC-BY, CC-BY-SA) are
  used, and only as counts — no photos or content are copied.

## 0.7.0 — 2026-07-19

**How open is the sky, really?**

- Every spot now knows its **real land horizon** — measured from a 30-meter
  elevation model, not assumed flat. A valley floor reads wide open; a spot
  down in a canyon or ringed by foothills reads closed.
- The **"Light today"** panel now tells you how high the land sits where the
  sun rises and sets ("sun clears 1° in the east, 4° in the west"), so you know
  whether the low golden light actually reaches you or hides behind a ridge.
- **Top spots gains an "Open horizon" filter.** Stack it with "Dark sky" and
  "Public land" and you've got the real astro shortlist: dark, open to the sky,
  and somewhere you can legally stand.
- Honest limit: an elevation model sees the land, not the trees — a
  meadow ringed by tall pines will read more open than it shoots.
- Terrain from the public-domain SRTM elevation model (NASA/USGS).

## 0.6.0 — 2026-07-19

**Which spots are on public land.**

- Every spot that sits inside a park, national forest, wilderness, or reserve
  is now marked — 488 of them across the region, from Desolation Wilderness to
  the Tahoe Basin. The popup names the land and reminds you to check access
  hours.
- **Top spots gains a "Public land" filter.** Combine it with "Dark sky" and
  you get the astro shortlist that matters: dark *and* somewhere you can
  legally stand at night.
- Boundaries from OpenStreetMap (ODbL).

## 0.5.0 — 2026-07-19

**Is tonight the night?**

- Every spot now has a **Tonight** panel: the **moon** (phase and how lit it
  is), the **dark window** — the exact hours the sun *and* moon are both down,
  which is your Milky-Way time — and a live **sky-tonight** cloud forecast.
- Put it together with the dark-sky layer and this answers the question no
  other app does: *a Bortle-2 spot, moonless from 11:29 PM, clear skies — go.*
- Moon and dark window are computed on your device (no signal needed); the
  cloud forecast is a quick live check from Open-Meteo (free, no account).

## 0.4.0 — 2026-07-19

**Dark skies, on the map and in the ranking.**

- A new **Dark sky** map layer shows how light-polluted the sky is everywhere
  in the region, on the real Bortle scale (1 = pristine, 9 = inner city), with
  an opacity slider and a legend that names every level.
- **Every spot now knows its Bortle rating.** Tap a place and its darkness
  shows in the "Why this spot" breakdown; a Sierra viewpoint reads Bortle 1–2,
  a valley park reads 6–7.
- **Top spots can now require dark skies** — combine "Dark sky" with "Open
  view" to find exactly the places worth a night shoot. This is the cross-layer
  question no other app answers.
- Built on the World Atlas of Artificial Night Sky Brightness
  (Falchi et al. 2016), used under CC BY-NC 4.0.

## 0.3.0 — 2026-07-19

**Find the spots where everything lines up.**

- New **★ Top spots** — the map ranks every place by how many things line up
  at once: a park that's *also* a birding hotspot, *also* an open viewpoint
  facing the evening light, *also* easy to reach. That combination is the one
  thing a single map can do that separate apps can't.
- **Require layers**: tap "Wildlife," "Open view," "Dark sky," etc. to narrow
  to only the spots that satisfy all of them together.
- Every place now shows a **"Why this spot"** breakdown — which layers earned
  its score, in plain words.
- Built to grow: each data source added from here (dark sky next) becomes a new
  ingredient in the score automatically.

## 0.2.0 — 2026-07-19

**Golden hour, for every spot.**

- Tap any place and see **today's light** for that exact spot: blue hour,
  golden hour, sunrise, and sunset — with the sunrise and sunset **compass
  direction** so you know which way to point the camera.
- All computed on your device from the spot's location and today's date —
  no signal needed, nothing sent anywhere.

## 0.1.0 — 2026-07-19

The first release: one map of every photo-worthy place in Sacramento,
El Dorado, and Placer counties.

- **2,362 places on one map** — viewpoints, parks, historical markers,
  roadside oddities, trailheads, campsites, and wildlife hotspots, each with
  a lettered pin so you can tell them apart at a glance (not by color alone).
- **Wildlife hotspots included** — every eBird birding hotspot in the three
  counties, marked as a dawn-and-golden-hour subject. Where a hotspot is also
  a park or campsite, it shows as one place tagged for birds and wildlife.
- **Filter by what you're shooting** — tap a category to show or hide it.
- **Drop your own pins** — tap and hold the map to save a spot on your device;
  back them up or move them with the Backup panel.
- **Works offline** — once loaded, the map data and your pins are available
  without a signal (the map tiles need a connection).
- **Every place links out** — open it in Apple or Google Maps, and see which
  open-data source it came from.

Built entirely on free, license-clean open data (OpenStreetMap and eBird).
No accounts, no tracking, nothing scraped from social platforms.
