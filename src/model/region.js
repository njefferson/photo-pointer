// Region access for the app (browser). The ingest scripts read the same
// config/region.json via fs — one file, two consumers, zero drift.

let cached = null;

export async function loadRegion() {
  if (cached) return cached;
  const res = await fetch('./config/region.json', { cache: 'no-cache' });
  if (!res.ok) throw new Error(`region config: HTTP ${res.status}`);
  cached = await res.json();
  return cached;
}

// Node-safe validation, shared with ingest's `validate` command and tests.
export function validateRegion(region) {
  const errs = [];
  if (!region.id) errs.push('region missing id');
  if (!region.name) errs.push('region missing name');
  const b = region.bbox;
  if (!b || !(b.south < b.north) || !(b.west < b.east)) {
    errs.push('region bbox invalid (need south<north, west<east)');
  }
  if (!Array.isArray(region.counties) || region.counties.length === 0) {
    errs.push('region needs at least one county');
  } else {
    for (const c of region.counties) {
      if (!c.name || !c.osm_area_name) errs.push(`county ${c.fips ?? '?'} missing name/osm_area_name`);
      if (!/^\d{5}$/.test(c.fips ?? '')) errs.push(`county ${c.name} bad fips`);
    }
  }
  return errs;
}
