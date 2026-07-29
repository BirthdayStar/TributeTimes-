'use strict';

// Verified index NAMING conventions per country/era — this table fixes the
// index *label* only (e.g. "FTSE 100" did not exist before Jan 1984, the UK
// index of that era was "London FT"). Historical index *values* are still
// AI-generated; verifying those against real historical data is a separate,
// larger effort (see Phase 3 scope doc Task 0.2) and out of scope here.
//
// Each country's timeline is ordered newest-first. The last entry in a
// timeline must have `from: null` — it is the fallback used for any date
// before every dated entry above it.
const MARKET_INDEX_TIMELINE = {
  'New Zealand':    [{ from: '1991-01-01', label: 'NZX 50' }, { from: null, label: 'NZSE 40' }],
  'Australia':      [{ from: '1992-01-01', label: 'ASX 200' }, { from: null, label: 'All Ordinaries' }],
  'United Kingdom': [{ from: '1984-01-01', label: 'FTSE 100' }, { from: null, label: 'London FT' }],
  'United States':  [{ from: null, label: 'Dow Jones' }],
  'Ireland':        [{ from: null, label: 'ISEQ' }],
  'Philippines':    [{ from: null, label: 'PSEi' }],
  'South Africa':   [{ from: null, label: 'JSE All Share' }],
  'Canada':         [{ from: null, label: 'S&P/TSX' }],
  'Singapore':      [{ from: null, label: 'Straits Times Index' }],
};

const DEFAULT_LOCAL_INDEX_LABEL = 'London FT';

function resolveLocalMarketIndexLabel(country, dateOfBirth) {
  const timeline = MARKET_INDEX_TIMELINE[country];
  if (!timeline) return DEFAULT_LOCAL_INDEX_LABEL;

  const dob = dateOfBirth instanceof Date ? dateOfBirth : new Date(dateOfBirth);
  for (const entry of timeline) {
    if (!entry.from) return entry.label;
    if (dob >= new Date(entry.from)) return entry.label;
  }
  return timeline[timeline.length - 1].label;
}

module.exports = { MARKET_INDEX_TIMELINE, resolveLocalMarketIndexLabel };
