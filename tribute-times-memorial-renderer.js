// ============================================================
// THE TRIBUTE TIMES — IN LOVING MEMORY HTML RENDERER (A4 PRINT-LOCKED)
// Version 1.0 — August 2026
// A genuinely separate rendering path for memorial keepsakes (see
// new_changes.md Step 12) — not the birthday renderer with occasion
// conditionals bolted on. Shares the same print-locked A4 layout
// geometry as tribute-times-renderer.js (same section heights, same
// fonts, same column grid) because that geometry is occasion-neutral
// print scaffolding, but every piece of recipient-facing copy is
// composed past-tense/reflective from the outset, and the counter,
// trivia heading, and message block are memorial-specific rather than
// birthday fields with values swapped in.
// ============================================================

const { titleCase, cleanTruncate, enforceExactYearLead } = require('./tribute-times-renderer');
const { buildStarMapSvg } = require('./src/phase2/star-map');

function getVintageMemorialReflection() {
  return "A life is measured not in years but in the moments that mattered, the people who were loved, and the quiet, lasting mark left behind. Today, on this day, we pause to remember.";
}

function renderMemorialNewspaper(data, content, fonts) {
  const {
    recipientName, dateFormatted, dateLong, day, month, year,
    country, senderName, edition, currency,
    relationship, datePassingFormatted, yearsLived, personalMessage,
  } = data;

  const cleanedRecipientName = titleCase(recipientName);

  const {
    worldNews: rawWorldNews, localNews: rawLocalNews, sport, business,
    chart, prices, weather, ticker,
    birthdays, astro, message,
  } = content;

  // See tribute-times-renderer.js enforceExactYearLead — guarantees the
  // "News of the Day" lead stories are from the person's actual birth
  // year, not just any year on the same calendar day.
  const worldNews = enforceExactYearLead(rawWorldNews, year);
  const localNews = enforceExactYearLead(rawLocalNews, year);

  // ── YEARS LIVED (birth -> passing, never to today) ──
  const yearsLivedStr = Number.isFinite(yearsLived)
    ? `${yearsLived.toLocaleString()} year${yearsLived === 1 ? '' : 's'} lived`
    : '';

  // ── NIGHT SKY STAR MAP (mathematically calculated, from the date of birth) ──
  const starMap = buildStarMapSvg({ year, month, day, country, size: 168 });
  const moonIlluminationPct = `${Math.round(starMap.illuminationFraction * 100)}%`;

  // ── PRICES TABLE ──
  const pricesHTML = prices.items.map(p => `
    <tr><td>${p.label}</td><td>${p.value}</td></tr>`).join('');

  // ── ALSO BORN THIS DAY (reframed heading — see new_changes.md Step 12:
  // "Born On This Day" reads as present-tense trivia about someone who has
  // passed; the facts themselves stay, per client instruction, only the
  // heading changes) ──
  const birthdaysHTML = birthdays.slice(0, 4).map((b, i) => `
    <div class="bday"><b>${b.name}</b> &mdash; <span class="desc">${cleanTruncate(b.note, 85)}</span></div>`).join('');

  // ── MUSIC CHART ──
  const chartsHTML = chart.entries.slice(0, 5).map(e => `
    <li><span class="entry-text"><b>${e.title}</b> &mdash; <span class="artist">${e.artist}</span></span></li>`).join('');

  // ── WEATHER CONTENT ──
  const weatherText = cleanTruncate(`${weather.season || 'The season'} in ${country}: ${weather.condition || 'typical weather'}, around ${weather.temp || ''}°C.`, 80);

  // ── ALSO ON THIS DAY STORIES ──
  const otd1Source = worldNews[1]
    ? { label: 'World', body: worldNews[1].body }
    : { label: 'Business', body: business[0]?.body || '' };
  const otd2Source = worldNews[2]
    ? { label: 'World', body: worldNews[2].body }
    : { label: 'Business', body: business[1]?.body || '' };
  const otd3Source = localNews[1]
    ? { label: country, body: localNews[1].body }
    : { label: 'Business', body: business[2]?.body || '' };

  const otd1Text = `<b>${otd1Source.label}:</b> ${cleanTruncate(otd1Source.body, 165)}`;
  const otd2Text = `<b>${otd2Source.label}:</b> ${cleanTruncate(otd2Source.body, 165)}`;
  const otd3Text = `<b>${otd3Source.label}:</b> ${cleanTruncate(otd3Source.body, 115)}`;

  // ── SPORT TEXT ──
  const sportEntry = sport[0];
  const sportText = cleanTruncate(
    sportEntry
      ? `${sportEntry.year ? sportEntry.year + ' — ' : ''}${sportEntry.headline || ''}${sportEntry.byline ? ` (${sportEntry.byline})` : ''}.`
      : 'No sporting results are available for this day.',
    200
  );

  // ── MEMORIAL MESSAGE (always past-tense/reflective — AI-authored via
  // tribute-times-memorial-prompt.js, or the personal message override) ──
  const finalMessage = cleanTruncate(personalMessage ? personalMessage.trim() : (message || ''), 260);

  // ── NEWS STORIES TRUNCATION ──
  const news1Body = cleanTruncate(worldNews[0]?.body || '', 235);
  const news2Body = cleanTruncate(localNews[0]?.body || '', 235);

  // ── REFLECTION PANEL (replaces the horoscope box — a memorial keepsake
  // has no reason to carry a birthday-style horoscope reading) ──
  const reflectionText = cleanTruncate(getVintageMemorialReflection(), 230);

  // ── NAME BANNER — client confirmed this format already works ──
  const bannerFullText = `IN LOVING MEMORY — ${cleanedRecipientName.toUpperCase()}`;
  const bannerLen = bannerFullText.length;
  const bannerFontSize = bannerLen <= 33 ? 21 : bannerLen <= 36 ? 18 : bannerLen <= 40 ? 16 : bannerLen <= 45 ? 14 : 12;

  // ── LEAD HEADLINE / SUB-HEADLINE ──
  // Headline is reflective, not a manufactured birth-announcement or the
  // day's raw news headline. Sub-headline references both dates, per the
  // client's explicit spec ("reference both dates: born [date], passed
  // [date]").
  const leadHeadline = 'A Life Remembered';
  const leadSub = cleanTruncate(`Born ${dateFormatted} &mdash; Passed ${datePassingFormatted}`, 105);

  // ── TICKER CONTENT ──
  const activeTicker = (ticker && ticker.length) ? ticker : [
    { label: 'Dow Jones', value: '1,234', direction: 'up' },
    { label: 'London FT', value: '512', direction: 'up' },
    { label: 'Gold', value: '$35', direction: 'up' },
    { label: 'Oil', value: '$14', direction: 'down' },
    { label: `${currency || 'USD'} Rate`, value: 'Stable', direction: 'flat' }
  ];
  const tickerHTML = activeTicker.map(t => {
    let arrow = '&bull;';
    let colorClass = 'tn';
    if (t.direction === 'up') {
      arrow = '▲';
      colorClass = 'tu';
    } else if (t.direction === 'down') {
      arrow = '▼';
      colorClass = 'td';
    }
    return `
      <div class="tick">
        <span class="tn">${t.label}:</span>
        <span class="tv">${t.value}</span>
        <span class="${colorClass}">${arrow}</span>
      </div>`;
  }).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>The Tribute Times — In Loving Memory of ${cleanedRecipientName}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=UnifrakturMaguntia&family=Playfair+Display:ital,wght@0,500;0,700;0,900;1,500&family=EB+Garamond:ital,wght@0,400;0,600;1,400&display=swap" rel="stylesheet">
<style>
  /* ================= FONT FACE SELF-HOSTED ================= */
  @font-face { font-family:'Chomsky'; src:url('data:font/otf;base64,${fonts.chomsky}') format('opentype'); }

  /* ================= PRINT LOCK — DO NOT MODIFY ================= */
  @page { size: A4 portrait; margin: 0; }
  * { margin: 0; padding: 0; box-sizing: border-box; }

  html, body { background: #6b6b6b; }

  .sheet {
    width: 210mm;
    height: 297mm;
    background: #f7f3e8;              /* aged paper */
    color: #1a1712;
    padding: 8mm 9mm 7mm 9mm;
    margin: 10mm auto;
    box-shadow: 0 4px 24px rgba(0,0,0,.45);
    overflow: hidden;                  /* the hard guarantee */
    font-family: 'EB Garamond', Georgia, serif;
    font-size: 8.4pt;
    line-height: 1.28;
    display: flex;
    flex-direction: column;
    print-color-adjust: exact;
    -webkit-print-color-adjust: exact;
  }

  /* ================= SCREEN-ONLY WRAPPER ================= */
  #wrap { width: 100%; display: flex; justify-content: center; }
  #star {
    width: 210mm;
    flex-shrink: 0;
    transform-origin: top center;
  }

  /* ================= MASTHEAD ================= */
  .masthead { height: 30mm; text-align: center; flex: 0 0 auto; }
  .masthead h1 {
    font-family: 'Chomsky', 'UnifrakturMaguntia', serif;
    font-weight: 400;
    font-size: 46pt;
    line-height: 1;
    letter-spacing: .5mm;
  }
  .masthead .est {
    font-size: 7pt; letter-spacing: 1.2mm; text-transform: uppercase;
    margin-top: 1.2mm;
  }
  .dateline {
    height: 6.5mm; flex: 0 0 auto;
    border-top: .6mm solid #1a1712; border-bottom: .25mm solid #1a1712;
    display: flex; align-items: center; justify-content: space-between;
    font-size: 7.5pt; letter-spacing: .3mm; text-transform: uppercase;
    padding: 0 1mm; margin-top: 1.5mm;
  }

  /* ================= TICKER ================= */
  .ticker {
    height: 6.5mm; flex: 0 0 auto;
    border-bottom: .25mm solid #1a1712;
    display: flex; align-items: center;
    background: #1a1712; color: #f7f3e8;
    font-size: 6pt;
    padding: 0 2mm;
    overflow: hidden;
    white-space: nowrap;
  }
  .ticker .tlabel {
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: .5px;
    margin-right: 3mm;
    border-right: .2mm solid #b9b09a;
    padding-right: 3mm;
    color: #c8a020;
    flex-shrink: 0;
  }
  .ticker .titems {
    display: flex;
    flex-grow: 1;
    justify-content: space-between;
    overflow: hidden;
  }
  .ticker .tick {
    display: flex;
    align-items: center;
    gap: 1.5mm;
  }
  .ticker .tn {
    text-transform: uppercase;
    color: #b9b09a;
  }
  .ticker .tv {
    font-weight: 600;
  }
  .ticker .tu {
    color: #5ad05a;
  }
  .ticker .td {
    color: #ff7878;
  }

  /* ================= NAME BANNER ================= */
  .name-banner {
    height: 17mm; flex: 0 0 auto;
    border-bottom: .25mm solid #1a1712;
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    gap: 1mm;
    padding: 0 2mm; margin-top: 1.5mm;
  }
  .name-banner-main {
    font-family: 'Playfair Display', Georgia, serif; font-weight: 900;
    font-size: 21pt; line-height: 1.05; letter-spacing: .6mm; text-transform: uppercase;
    color: #8b1010; text-align: center;
    display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
  }
  .name-banner-from {
    font-family: 'Playfair Display', serif; font-style: italic; font-weight: 500;
    font-size: 9pt; letter-spacing: .3mm; color: #1a1712;
    display: -webkit-box; -webkit-line-clamp: 1; -webkit-box-orient: vertical; overflow: hidden;
  }

  /* ================= LEAD HEADLINE ================= */
  .lead { height: 22mm; flex: 0 0 auto; text-align: center; padding-top: 2mm; overflow: hidden; }
  .lead h2 {
    font-family: 'Playfair Display', serif; font-weight: 900;
    font-size: 19pt; line-height: 1.05;
    display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
  }
  .lead .sub {
    font-family: 'Playfair Display', serif; font-style: italic; font-weight: 500;
    font-size: 9.5pt; margin-top: 1.2mm;
    display: -webkit-box; -webkit-line-clamp: 1; -webkit-box-orient: vertical; overflow: hidden;
  }

  /* ================= COLUMN GRID ================= */
  .cols {
    flex: 1 1 auto; min-height: 0;
    display: grid;
    grid-template-columns: 1fr 1.15fr 1fr;
    gap: 0 4mm;
    border-top: .25mm solid #1a1712;
    padding-top: 2mm; margin-top: 2mm;
    overflow: hidden;
  }
  .col { min-width: 0; overflow: hidden; display: flex; flex-direction: column; }
  .col + .col { border-left: .2mm solid #b9b09a; padding-left: 4mm; }

  section { overflow: hidden; flex: 0 0 auto; }
  section h3 {
    font-family: 'Playfair Display', serif; font-weight: 700;
    font-size: 9pt; text-transform: uppercase; letter-spacing: .4mm;
    border-bottom: .25mm solid #1a1712; padding-bottom: .8mm; margin-bottom: 1.4mm;
  }
  section p { text-align: justify; }
  .clamp2 { display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; }
  .clamp3 { display:-webkit-box; -webkit-line-clamp:3; -webkit-box-orient:vertical; overflow:hidden; }
  .clamp4 { display:-webkit-box; -webkit-line-clamp:4; -webkit-box-orient:vertical; overflow:hidden; }
  .clamp6 { display:-webkit-box; -webkit-line-clamp:6; -webkit-box-orient:vertical; overflow:hidden; }
  .story-head {
    font-family:'Playfair Display', serif; font-weight:700; font-size:10.5pt; line-height:1.1;
    margin-bottom:1mm;
    display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden;
  }

  /* fixed section heights — the budget that guarantees one page */
  .s-news1     { height: 70mm; }
  .s-news2     { height: 58mm; margin-top: 3mm; }
  .s-prices    { height: 50mm; margin-top: 3mm; }
  .s-onthisday { height: 54mm; }
  .s-message   { height: 72mm; margin-top: 3mm; }
  .s-birthdays { height: 52mm; margin-top: 3mm; }
  .s-charts    { height: 44mm; }
  .s-weather   { height: 16mm; margin-top: 3mm; }
  .s-horoscope { height: 40mm; margin-top: 3mm; }
  .s-sport     { height: 22mm; margin-top: 3mm; }
  .s-starmap   { height: 50mm; margin-top: 3mm; text-align: center; }

  /* tables & lists */
  .datatable { width: 100%; border-collapse: collapse; font-size: 8.2pt; }
  .datatable td { padding: .6mm 0; border-bottom: .15mm dotted #b9b09a; vertical-align: top; }
  .datatable td:last-child { text-align: right; white-space: nowrap; }
  ol.chart { list-style: none; counter-reset: c; }
  ol.chart li { counter-increment: c; padding: .7mm 0; border-bottom: .15mm dotted #b9b09a;
    display: flex; align-items: baseline; gap: 1mm; }
  ol.chart li::before { content: counter(c) "."; font-weight: 600; flex-shrink: 0; }
  ol.chart li .entry-text {
    min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis;
  }
  ol.chart .artist { font-style: italic; }

  /* the personal message centerpiece */
  .s-message .box {
    border: .5mm double #1a1712; height: calc(100% - 5mm);
    padding: 2.5mm; text-align: center;
    display: flex; flex-direction: column; justify-content: center; gap: 1.5mm;
    background: #fbf8ef;
  }
  .s-message .to { font-family:'Playfair Display', serif; font-size: 11pt; font-weight: 700; }
  .s-message .msg { font-style: italic; font-size: 9pt;
    display:-webkit-box; -webkit-line-clamp:7; -webkit-box-orient:vertical; overflow:hidden; }
  .s-message .from { font-size: 8.5pt; }

  .bday { padding: .8mm 0; border-bottom: .15mm dotted #b9b09a; }
  .bday b { font-weight: 600; }
  .bday .desc { display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; }

  .starmap-graphic { display: flex; justify-content: center; margin: 0.5mm 0 1mm; }
  .starmap-graphic svg { width: 31mm; height: 31mm; display: block; }
  .starmap-caption { font-size: 7.3pt; font-style: italic; color: #3d3730; }
  .agecount { margin-top: 1.5mm; font-family:'Playfair Display', serif; font-weight: 700; font-size: 9.5pt; }

  /* ================= FOOTER ================= */
  .foot {
    height: 7mm; flex: 0 0 auto;
    border-top: .6mm solid #1a1712;
    display: flex; align-items: center; justify-content: space-between;
    font-size: 7pt; letter-spacing: .3mm; text-transform: uppercase; margin-top: 2mm;
  }
</style>
</head>
<body>

<div id="wrap">
  <div id="star">
    <div class="sheet">

  <header class="masthead">
    <h1>The Tribute Times</h1>
    <div class="est">A Personal Record of a Life Remembered &bull; Est. for One Reader Only</div>
  </header>

  <div class="dateline">
    <span data-field="dateline-day">${dateLong}</span>
    <span data-field="dateline-edition">Memorial Keepsake &mdash; No. 1 of 1</span>
    <span data-field="dateline-price">Price: Priceless</span>
  </div>

  <div class="ticker">
    <span class="tlabel">Financial Markets</span>
    <div class="titems">
      ${tickerHTML}
    </div>
  </div>

  <div class="name-banner">
    <div class="name-banner-main" data-field="banner-text" style="font-size:${bannerFontSize}pt">${bannerFullText}</div>
    ${relationship ? `<div class="name-banner-from" data-field="relationship">${titleCase(relationship)}</div>` : ''}
  </div>

  <div class="lead">
    <h2 data-field="lead-headline">${leadHeadline}</h2>
    <div class="sub" data-field="lead-subhead">${leadSub}</div>
  </div>

  <div class="cols">

    <!-- ============ COLUMN 1 ============ -->
    <div class="col">
      <section class="s-news1">
        <h3>News of the Day</h3>
        <div class="story-head" data-field="news1-head">${worldNews[0]?.headline || ''}</div>
        <p class="clamp6" data-field="news1-body">${news1Body}</p>
      </section>
      <section class="s-news2">
        <div class="story-head" data-field="news2-head">${localNews[0]?.headline || ''}</div>
        <p class="clamp6" data-field="news2-body">${news2Body}</p>
      </section>
      <section class="s-prices">
        <h3>Cost of Living, <span data-field="prices-year">${year}</span></h3>
        <table class="datatable" data-field="prices-table">
          ${pricesHTML}
        </table>
      </section>
    </div>

    <!-- ============ COLUMN 2 (CENTRE) ============ -->
    <div class="col">
      <section class="s-onthisday">
        <h3>Also On This Day</h3>
        <p class="clamp4" data-field="otd-1">${otd1Text}</p>
        <p class="clamp4" data-field="otd-2" style="margin-top:1.5mm">${otd2Text}</p>
        <p class="clamp3" data-field="otd-3" style="margin-top:1.5mm">${otd3Text}</p>
      </section>
      <section class="s-message">
        <div class="box">
          <div class="to" data-field="msg-to">In Memory of ${cleanedRecipientName}</div>
          <div class="msg" data-field="msg-body">&ldquo;${finalMessage}&rdquo;</div>
          <div class="from" data-field="msg-from">&mdash; Forever loved by ${senderName}</div>
        </div>
      </section>
      <section class="s-birthdays">
        <h3>Also Born This Day</h3>
        ${birthdaysHTML}
      </section>
    </div>

    <!-- ============ COLUMN 3 ============ -->
    <div class="col">
      <section class="s-charts">
        <h3>Top of the Charts</h3>
        <ol class="chart" data-field="charts">
          ${chartsHTML}
        </ol>
      </section>
      <section class="s-weather">
        <h3>The Weather</h3>
        <p class="clamp2" data-field="weather">${weatherText}</p>
      </section>
      <section class="s-horoscope">
        <h3>In Reflection</h3>
        <p class="clamp6" data-field="reflection">${reflectionText}</p>
      </section>
      <section class="s-sport">
        <h3>Sporting News</h3>
        <p class="clamp6" data-field="sport">${sportText}</p>
      </section>
      <section class="s-starmap">
        <h3>The Night Sky</h3>
        <div class="starmap-graphic">${starMap.svg}</div>
        <div class="starmap-caption" data-field="moon-phase">${astro.moonPhase.name || 'Clear'} Moon &middot; ${moonIlluminationPct} illuminated</div>
        ${yearsLivedStr ? `<div class="agecount" data-field="years-lived">${yearsLivedStr}</div>` : ''}
      </section>
    </div>

  </div>

  <footer class="foot">
    <span>The Tribute Times &mdash; tributetimes.co.nz</span>
    <span data-field="foot-code">Keepsake Ref: TT-${Math.floor(1000 + Math.random() * 9000)}</span>
  </footer>

  </div>
</div>
</div>

</body>
</html>`;
}

module.exports = { renderMemorialNewspaper };
