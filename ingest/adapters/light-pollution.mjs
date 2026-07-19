// Light-pollution / dark-sky quality — STUB. A MAP LAYER, not per-point data.
//
// Design decision (from the task spec): sky darkness is a continuous raster
// overlay the map renders, not thousands of fake "dark sky" point spots.
// Discrete `dark_sky` category spots are reserved for genuinely notable
// sites (designated dark-sky places, known astro pull-outs), curated or
// derived later from the raster's darkest accessible cells.
//
// LICENSE OPTIONS (verify at implementation time, encode the choice here):
//  - VIIRS DNB annual composites (NOAA/Earth Observation Group): free for
//    research/non-commercial with attribution; registration required for
//    bulk download.
//  - World Atlas 2015 (Falchi et al.): data available for NON-COMMERCIAL
//    use with attribution + notification to the authors; the popular
//    lightpollutionmap.info tiles are NOT freely re-usable — do not hotlink.
//  - djlorenz.github.io/astronomy/lp/ overlays (based on VIIRS): check the
//    stated terms; historically permissive for personal use.
//
// TODO(light-pollution):
//  - Pick source, download the raster once, crop to region bbox, quantize
//    to Bortle-ish classes, emit a small committed PNG + world-file JSON
//    (data/layers/light-pollution.{png,json}).
//  - Render as a Leaflet ImageOverlay with an opacity slider; legend must
//    carry text labels per class (non-hue channel), not color alone.

export const meta = {
  source: 'light_pollution',
  name: 'Light-pollution raster (VIIRS / World Atlas)',
  license: 'TBD at implementation — candidates above; attribution required in all cases',
  attribution: 'TBD',
  status: 'stub',
  kind: 'layer', // not a per-point source
};

export async function ingest() {
  throw new Error(
    'light-pollution adapter is a stub — a raster map layer, not points; see TODO in ingest/adapters/light-pollution.mjs'
  );
}
