'use strict';

// ============================================================
// NIGHT SKY STAR MAP — mathematically calculated, not AI-generated.
// Given a birth date + country, renders an SVG polar star chart of the
// actual visible sky (stars above horizon + correct moon phase/position)
// using astronomy-engine for the real astronomical math.
// ============================================================

const Astronomy = require('astronomy-engine');

// Country-centroid coordinates (approved simplification — the app only
// collects a birth country, not a city/coordinates, so this is a
// representative capital-city location per country, not the exact birth
// location). Also carries a rough fixed UTC offset (no DST, no
// intra-country timezone variation) used only to pick a representative
// "evening" viewing time for the chart.
const COUNTRY_LOCATIONS = {
  'New Zealand':    { lat: -41.2865, lon: 174.7762, utcOffsetHours: 12 },
  'Australia':      { lat: -35.2809, lon: 149.1300, utcOffsetHours: 10 },
  'United Kingdom': { lat: 51.5072, lon: -0.1276, utcOffsetHours: 0 },
  'Ireland':        { lat: 53.3498, lon: -6.2603, utcOffsetHours: 0 },
  'United States':  { lat: 38.9072, lon: -77.0369, utcOffsetHours: -5 },
  'Philippines':    { lat: 14.5995, lon: 120.9842, utcOffsetHours: 8 },
  'South Africa':   { lat: -25.7479, lon: 28.2293, utcOffsetHours: 2 },
  'Canada':         { lat: 45.4215, lon: -75.6972, utcOffsetHours: -5 },
  'Singapore':      { lat: 1.3521, lon: 103.8198, utcOffsetHours: 8 },
};
const DEFAULT_LOCATION = COUNTRY_LOCATIONS['New Zealand'];

// A curated bright-star catalog (J2000 RA in hours, Dec in degrees,
// visual magnitude — lower/negative is brighter). Precession is not
// corrected for; over the app's ~1920-present date range this shifts a
// star's true position by at most a couple of degrees, an acceptable
// simplification for a decorative chart, not a precision instrument.
// Spans both hemispheres since supported countries range from NZ/AU/PH/ZA
// (south) to UK/Ireland/US/Canada (north).
const STARS = [
  // Ursa Major (Big Dipper)
  { name: 'Dubhe', ra: 11.062, dec: 61.75, mag: 1.79, con: 'UMa' },
  { name: 'Merak', ra: 11.031, dec: 56.38, mag: 2.37, con: 'UMa' },
  { name: 'Phecda', ra: 11.897, dec: 53.69, mag: 2.44, con: 'UMa' },
  { name: 'Megrez', ra: 12.257, dec: 57.03, mag: 3.32, con: 'UMa' },
  { name: 'Alioth', ra: 12.900, dec: 55.96, mag: 1.77, con: 'UMa' },
  { name: 'Mizar', ra: 13.399, dec: 54.93, mag: 2.23, con: 'UMa' },
  { name: 'Alkaid', ra: 13.792, dec: 49.31, mag: 1.86, con: 'UMa' },
  // Orion
  { name: 'Betelgeuse', ra: 5.919, dec: 7.407, mag: 0.42, con: 'Ori' },
  { name: 'Bellatrix', ra: 5.418, dec: 6.350, mag: 1.64, con: 'Ori' },
  { name: 'Rigel', ra: 5.242, dec: -8.202, mag: 0.13, con: 'Ori' },
  { name: 'Saiph', ra: 5.796, dec: -9.670, mag: 2.07, con: 'Ori' },
  { name: 'Alnitak', ra: 5.679, dec: -1.943, mag: 1.74, con: 'Ori' },
  { name: 'Alnilam', ra: 5.603, dec: -1.202, mag: 1.69, con: 'Ori' },
  { name: 'Mintaka', ra: 5.533, dec: -0.299, mag: 2.23, con: 'Ori' },
  // Crux (Southern Cross)
  { name: 'Acrux', ra: 12.443, dec: -63.099, mag: 0.77, con: 'Cru' },
  { name: 'Gacrux', ra: 12.519, dec: -57.113, mag: 1.63, con: 'Cru' },
  { name: 'Imai', ra: 12.252, dec: -58.749, mag: 2.79, con: 'Cru' },
  { name: 'Mimosa', ra: 12.795, dec: -59.689, mag: 1.25, con: 'Cru' },
  // Cassiopeia
  { name: 'Schedar', ra: 0.675, dec: 56.537, mag: 2.24, con: 'Cas' },
  { name: 'Caph', ra: 0.153, dec: 59.150, mag: 2.28, con: 'Cas' },
  { name: 'Gamma Cas', ra: 0.945, dec: 60.717, mag: 2.47, con: 'Cas' },
  { name: 'Ruchbah', ra: 1.430, dec: 60.235, mag: 2.68, con: 'Cas' },
  { name: 'Segin', ra: 1.906, dec: 63.670, mag: 3.35, con: 'Cas' },
  // Scorpius
  { name: 'Antares', ra: 16.490, dec: -26.432, mag: 1.06, con: 'Sco' },
  { name: 'Graffias', ra: 16.090, dec: -19.805, mag: 2.56, con: 'Sco' },
  { name: 'Dschubba', ra: 16.006, dec: -22.622, mag: 2.29, con: 'Sco' },
  { name: 'Sargas', ra: 17.622, dec: -42.998, mag: 1.87, con: 'Sco' },
  { name: 'Shaula', ra: 17.560, dec: -37.104, mag: 1.62, con: 'Sco' },
  // Leo
  { name: 'Regulus', ra: 10.139, dec: 11.967, mag: 1.35, con: 'Leo' },
  { name: 'Denebola', ra: 11.818, dec: 14.572, mag: 2.14, con: 'Leo' },
  { name: 'Algieba', ra: 10.333, dec: 19.842, mag: 2.28, con: 'Leo' },
  // Cygnus (Northern Cross)
  { name: 'Deneb', ra: 20.690, dec: 45.280, mag: 1.25, con: 'Cyg' },
  { name: 'Sadr', ra: 20.370, dec: 40.257, mag: 2.23, con: 'Cyg' },
  { name: 'Albireo', ra: 19.512, dec: 27.960, mag: 3.18, con: 'Cyg' },
  { name: 'Gienah', ra: 20.770, dec: 33.970, mag: 2.46, con: 'Cyg' },
  { name: 'Delta Cyg', ra: 19.749, dec: 45.131, mag: 2.87, con: 'Cyg' },
  // Standalone bright stars (no constellation lines drawn)
  { name: 'Sirius', ra: 6.752, dec: -16.716, mag: -1.46, con: null },
  { name: 'Canopus', ra: 6.399, dec: -52.696, mag: -0.74, con: null },
  { name: 'Vega', ra: 18.615, dec: 38.784, mag: 0.03, con: null },
  { name: 'Arcturus', ra: 14.261, dec: 19.182, mag: -0.05, con: null },
  { name: 'Capella', ra: 5.278, dec: 45.998, mag: 0.08, con: null },
  { name: 'Procyon', ra: 7.655, dec: 5.225, mag: 0.34, con: null },
  { name: 'Altair', ra: 19.846, dec: 8.868, mag: 0.77, con: null },
  { name: 'Polaris', ra: 2.530, dec: 89.264, mag: 1.98, con: null },
  { name: 'Achernar', ra: 1.628, dec: -57.237, mag: 0.46, con: null },
  { name: 'Fomalhaut', ra: 22.961, dec: -29.622, mag: 1.16, con: null },
  { name: 'Aldebaran', ra: 4.599, dec: 16.509, mag: 0.85, con: null },
];

// Line segments within each constellation (by star name).
const CONSTELLATION_LINES = [
  ['Dubhe', 'Merak'], ['Merak', 'Phecda'], ['Phecda', 'Megrez'], ['Megrez', 'Dubhe'],
  ['Megrez', 'Alioth'], ['Alioth', 'Mizar'], ['Mizar', 'Alkaid'],
  ['Betelgeuse', 'Alnitak'], ['Alnitak', 'Alnilam'], ['Alnilam', 'Mintaka'], ['Mintaka', 'Bellatrix'],
  ['Betelgeuse', 'Bellatrix'], ['Alnitak', 'Saiph'], ['Mintaka', 'Rigel'], ['Rigel', 'Saiph'],
  ['Acrux', 'Gacrux'], ['Imai', 'Mimosa'],
  ['Caph', 'Schedar'], ['Schedar', 'Gamma Cas'], ['Gamma Cas', 'Ruchbah'], ['Ruchbah', 'Segin'],
  ['Graffias', 'Dschubba'], ['Dschubba', 'Antares'], ['Antares', 'Sargas'], ['Sargas', 'Shaula'],
  ['Regulus', 'Algieba'], ['Algieba', 'Denebola'],
  ['Deneb', 'Sadr'], ['Sadr', 'Albireo'], ['Gienah', 'Sadr'], ['Sadr', 'Delta Cyg'],
];

function resolveLocation(country) {
  return COUNTRY_LOCATIONS[country] || DEFAULT_LOCATION;
}

function resolveObservationDate(year, month, day, country) {
  const location = resolveLocation(country);
  // Representative "evening" viewing time — 9pm local, converted to UTC
  // via the country's fixed (non-DST) offset. Good enough for a
  // decorative chart; not meant to be the exact birth moment.
  const utcHour = 21 - location.utcOffsetHours;
  return new Date(Date.UTC(year, month - 1, day, 0, 0, 0) + utcHour * 3600 * 1000);
}

// Standard polar (stereographic-ish) azimuthal projection: distance from
// center maps altitude (90=zenith at center, 0=horizon at the rim),
// angle maps azimuth (0=North at top, clockwise through East).
function projectToXY(azimuthDeg, altitudeDeg, radius) {
  const r = radius * (90 - altitudeDeg) / 90;
  const theta = (azimuthDeg - 90) * (Math.PI / 180); // rotate so North is up
  return {
    x: radius + r * Math.cos(theta),
    y: radius + r * Math.sin(theta),
  };
}

function starRadiusForMagnitude(mag) {
  const r = 2.6 - mag * 0.42;
  return Math.max(0.6, Math.min(3.4, r));
}

function buildStarMapSvg({ year, month, day, country, size = 300 }) {
  const location = resolveLocation(country);
  const date = resolveObservationDate(year, month, day, country);
  const observer = new Astronomy.Observer(location.lat, location.lon, 0);
  const radius = size / 2;

  const visiblePositions = new Map();
  STARS.forEach(star => {
    const horizontal = Astronomy.Horizon(date, observer, star.ra, star.dec, 'normal');
    if (horizontal.altitude > 0) {
      visiblePositions.set(star.name, {
        ...projectToXY(horizontal.azimuth, horizontal.altitude, radius),
        mag: star.mag,
      });
    }
  });

  const lineSvg = CONSTELLATION_LINES
    .filter(([a, b]) => visiblePositions.has(a) && visiblePositions.has(b))
    .map(([a, b]) => {
      const p1 = visiblePositions.get(a);
      const p2 = visiblePositions.get(b);
      return `<line x1="${p1.x.toFixed(1)}" y1="${p1.y.toFixed(1)}" x2="${p2.x.toFixed(1)}" y2="${p2.y.toFixed(1)}" class="cline" />`;
    })
    .join('');

  const starSvg = Array.from(visiblePositions.values())
    .map(p => `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${starRadiusForMagnitude(p.mag).toFixed(2)}" class="star" />`)
    .join('');

  const moonEquator = Astronomy.Equator(Astronomy.Body.Moon, date, observer, true, true);
  const moonHorizontal = Astronomy.Horizon(date, observer, moonEquator.ra, moonEquator.dec, 'normal');
  const illumination = Astronomy.Illumination(Astronomy.Body.Moon, date);
  const moonSvg = moonHorizontal.altitude > 0
    ? buildMoonGlyph(projectToXY(moonHorizontal.azimuth, moonHorizontal.altitude, radius), illumination.phase_fraction)
    : '';

  return {
    illuminationFraction: illumination.phase_fraction,
    svg: `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="skyGrad" cx="50%" cy="42%" r="75%">
          <stop offset="0%" stop-color="#1a2340"/>
          <stop offset="100%" stop-color="#05070f"/>
        </radialGradient>
      </defs>
      <style>
        .cline { stroke: #c8a020; stroke-width: 0.4; opacity: 0.55; }
        .star { fill: #f7f3e8; }
      </style>
      <circle cx="${radius}" cy="${radius}" r="${radius - 1}" fill="url(#skyGrad)" stroke="#c8a020" stroke-width="1.2"/>
      ${lineSvg}
      ${starSvg}
      ${moonSvg}
    </svg>`,
  };
}

function buildMoonGlyph(pos, illuminationFraction) {
  const r = 6.5;
  const litWidth = r * 2 * illuminationFraction;
  return `
    <g transform="translate(${pos.x.toFixed(1)}, ${pos.y.toFixed(1)})">
      <circle r="${r}" fill="#2a2f45" stroke="#f7f3e8" stroke-width="0.5"/>
      <clipPath id="moonClip"><circle r="${r}" /></clipPath>
      <ellipse cx="${(r - litWidth / 2).toFixed(2)}" cy="0" rx="${(litWidth / 2).toFixed(2)}" ry="${r}" fill="#f7f3e8" clip-path="url(#moonClip)"/>
    </g>`;
}

module.exports = { buildStarMapSvg, COUNTRY_LOCATIONS };
