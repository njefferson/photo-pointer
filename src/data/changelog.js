// In-app changelog — newest first. CHANGELOG[0].v is the current version and
// must match sw.js CACHE ('pointer-<v>'); bump both together on every release.
// Written for the end user: what changed for them, not how.
export const CHANGELOG = [
  { v: '0.16.2', t: 'Humboldt opens on Arcata', n: 'Switching to the Humboldt Coast region now opens centered on Arcata, instead of zoomed out to the whole coast.' },
  { v: '0.16.1', t: 'A cleaner zoomed-out map', n: 'Zoomed out, the map now thins overlapping pins to a clean spread — keeping the most worthwhile pin in each patch — so a dense region is readable instead of a pile, and lighter to draw, not heavier. The pin-type buttons stay simple on/off toggles.' },
  { v: '0.15.2', t: 'Fewer junk markers', n: 'Only verified historical markers (a Wikipedia article, a real Historical Marker Database entry, a California Historical Landmark, a heritage listing, or an actual plaque) now get a marker pin. Random community-tagged “monuments” are hidden — unless the spot is worthwhile for another reason, like being photographed or a wildlife spot.' },
  { v: '0.15.1', t: 'Fixes: dark map, scrolling popups, readable toggle', n: 'The dark theme now actually darkens the map (and works offline). Long place cards scroll inside the popup with a big close button, and any pop-up can be dismissed by tapping outside it — nothing traps you. The Map/List toggle no longer clips “List”.' },
  { v: '0.15.0', t: 'Know what’s worthwhile, and follow the links', n: 'Places now show whether they’re genuinely notable (a landmark, Wikipedia, a real historical marker) or just community-tagged. Clear “View on OpenStreetMap →” links, and the photo/wildlife counts link out to see them. Top-spots filters are now three-state — tap to require a layer (✓), again to exclude it (✕) — and no longer look pre-selected.' },
  { v: '0.14.0', t: 'Favorites, a list view & a dark map', n: 'Save any place as a favorite (★). New List view of every place in the region, sortable by distance from you, name or type, with a favorites-only filter. The map now goes dark with the theme, and the map-type button shows a proper icon.' },
  { v: '0.13.8', t: 'What’s new on update', n: 'After the app updates, a short “What’s new” pop-up shows what changed since you last opened it.' },
  { v: '0.13.7', t: 'Clearer Top-spots filters', n: 'Dropped the confusing “Layered” filter — it’s already how Top spots are ranked, not a layer you require. The filters are now just the real layers.' },
  { v: '0.13.6', t: 'Welcome, install & this ⓘ', n: 'A first-open welcome that explains why photo-pointer exists and how to add it to your home screen — all here under ⓘ, with the changelog.' },
  { v: '0.13.4', t: 'Empty-map tip', n: 'A gentle nudge when every pin type is switched off, so a blank map never looks broken.' },
  { v: '0.13.3', t: 'Lands where you are', n: 'Opening near Humboldt or Yellowstone switches to that map; anywhere outside the covered areas centers on Cameron Park.' },
  { v: '0.13.2', t: 'Wikipedia links', n: 'A “Read about this place on Wikipedia” link on spots we can tie to an article.' },
  { v: '0.13.1', t: 'Marker inscriptions', n: 'Historic markers show the plaque’s own words and a clear link to the full reference page.' },
  { v: '0.13.0', t: 'Three regions + faster map', n: 'Humboldt Coast and Yellowstone added; the map only draws what’s in view, so dense regions stay smooth.' },
  { v: '0.12.0', t: 'Opens where you are', n: 'Starts on your location with a center button; pin types start off, with one-tap Show all / Hide all.' },
  { v: '0.11.0', t: 'Air today', n: 'Live air-quality and wildfire-smoke readout for each spot.' },
  { v: '0.10.0', t: 'Photographed', n: 'How many freely-licensed photos people take near each place.' },
  { v: '0.9.0', t: 'Historical markers', n: 'Monuments and landmarks, with links to read the history.' },
  { v: '0.8.0', t: 'Wild subjects', n: 'Non-bird wildlife density from iNaturalist.' },
  { v: '0.7.0', t: 'Open horizon', n: 'Each spot’s real measured horizon for sunrise, sunset and the Milky Way.' },
  { v: '0.6.0', t: 'Public lands', n: 'Shows which spots sit on protected public land.' },
  { v: '0.5.0', t: 'Tonight', n: 'Moon phase, the dark-sky window, and cloud cover for tonight.' },
  { v: '0.4.0', t: 'Dark skies', n: 'A Bortle sky-darkness rating per spot and a light-pollution overlay.' },
  { v: '0.3.0', t: 'Top spots', n: 'Ranks places where several layers line up for a shoot.' },
  { v: '0.2.0', t: 'Golden hour', n: 'Sunrise, sunset and golden/blue-hour times, computed on your device.' },
  { v: '0.1.0', t: 'First release', n: 'One region map of photo-worthy places, from open data only.' },
];

export const VERSION = CHANGELOG[0].v;
