// In-app changelog — newest first. CHANGELOG[0].v is the current version and
// must match sw.js CACHE ('pointer-<v>'); bump both together on every release.
// Written for the end user: what changed for them, not how.
export const CHANGELOG = [
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
