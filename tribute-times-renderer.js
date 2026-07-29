// ============================================================
// THE TRIBUTE TIMES — HTML RENDERER (A4 PRINT-LOCKED V2)
// Takes the AI JSON output and builds the complete newspaper HTML
// Version 2.0 — July 2026
// ============================================================

const { getStarSign, getChineseZodiac, getMoonPhase } = require('./tribute-times-ai-prompt');
const { buildStarMapSvg } = require('./src/phase2/star-map');

function titleCase(value) {
  return String(value || '')
    .split(/\s+/)
    .filter(Boolean)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function cleanTruncate(text, maxLength) {
  if (!text) return '';
  const str = String(text).trim();
  if (str.length <= maxLength) return str;

  // Try to truncate at the last sentence boundary (. ! ?)
  const sentenceRegex = /[.!?]\s+/g;
  let match;
  let lastSentenceIndex = -1;

  while ((match = sentenceRegex.exec(str)) !== null) {
    const endIndex = match.index + 1; // Include the punctuation
    if (endIndex <= maxLength) {
      lastSentenceIndex = endIndex;
    } else {
      break;
    }
  }

  if (lastSentenceIndex > 0) {
    return str.slice(0, lastSentenceIndex).trim();
  }

  // Fallback to word boundary
  const sliced = str.slice(0, maxLength);
  const lastSpace = sliced.lastIndexOf(' ');
  if (lastSpace > 0) {
    return sliced.slice(0, lastSpace).trim() + '...';
  }

  return sliced.trim() + '...';
}

function getVintageHoroscope(signName) {
  const horoscopes = {
    Aries: "The stars align to grant you immense energy and pioneering spirit. Your natural leadership will shine in professional endeavors. Avoid rash decisions in financial matters; patience yields the greatest rewards. In personal relationships, a warm gesture from an old friend brings unexpected joy. Keep your focus on long-term goals.",
    Taurus: "A period of stability and grounded growth awaits you. Trust your instincts when navigating complex career choices. Financial prudence today ensures prosperous returns tomorrow. A pleasant surprise in your domestic sphere will warm your heart. Take time to appreciate the quiet beauties of life.",
    Gemini: "Your intellectual curiosity is heightened under the current celestial influence. New avenues of learning and communication open up. Strive for clarity in your interactions to avoid minor misunderstandings. A spontaneous conversation may spark an exciting new project. Balance your busy mind with rest.",
    Cancer: "Sensitivities are heightened, guiding you toward deep emotional insights. Nurture your home environment, as it remains your ultimate sanctuary. An old creative pursuit calls for your attention; do not hesitate to revisit it. Warmth in family circles brings comfort. Trust the natural flow of events.",
    Leo: "Your innate radiance and courage take center stage. Professional recognition is well within reach if you stay true to your vision. Be generous with your warmth, but ensure your personal boundaries remain intact. A joyous social gathering will highlight your weekend. Lead with your heart.",
    Virgo: "Meticulous planning and attention to detail bring excellent results. Your analytical mind resolves a long-standing challenge at work. Remember to balance productivity with self-care to avoid burnout. A thoughtful letter or message from afar brings pleasant news. Trust in your unique skills.",
    Libra: "Harmonious energies surround you, promoting balance in all areas of life. Creative endeavors are highly favored; let your artistic expression flow freely. A key relationship benefits from open, heartfelt communication. Seek beauty in your surroundings. A financial decision requires careful weighing.",
    Scorpio: "Intense focus and determination unlock new paths of transformation. Your passion guides you toward resolving a major personal goal. Trust your inner wisdom when faced with career transitions. A deep connection with a close confidant is strengthened. Embrace the changes coming your way.",
    Sagittarius: "An adventurous spirit prompts you to explore new horizons, either in mind or travel. Optimism opens doors that previously seemed closed. Stay focused on your core values amidst busy schedules. A warm encounter brings laughter and joy. Keep looking forward with confidence.",
    Capricorn: "Patience and hard work lay the foundation for long-term success. Your professional dedication is noted by peers. Practical financial choices serve you well under current transits. A quiet evening spent with loved ones brings deep contentment. Your strength is your steady anchor.",
    Aquarius: "Innovative thoughts and unique perspectives set you apart. Collaboration on a shared community goal brings deep satisfaction. Stay receptive to unconventional ideas that come your way. A surprise encounter sparks inspiration. Keep nurturing your independent spirit.",
    Pisces: "Intuition and artistic vision guide your steps through this period. A gentle, compassionate approach resolves a complex family matter. Trust your dreams, as they hold keys to your creative growth. A serene moment near water brings clarity and peace. Let your heart lead."
  };
  return horoscopes[signName] || "The celestial transits indicate a year of remarkable personal growth, steady progress, and rewarding achievements. Trust your inner compass and embrace the opportunities that lay ahead.";
}

function renderNewspaper(data, content, fonts) {
  const {
    recipientName, dateFormatted, dateLong, day, month, year,
    country, occasion, bannerText, senderName, stationName,
    edition, currency, age, personalMessage
  } = data;

  const cleanedRecipientName = titleCase(recipientName);

  const {
    worldNews, localNews, sport, business,
    chart, prices, weather, ticker,
    worldInNumbers, books, cinema, birthdays,
    astro, message
  } = content;

  // Calculate days old dynamically
  const dobDate = new Date(year, month - 1, day);
  const today = new Date();
  const diffMs = today.getTime() - dobDate.getTime();
  const daysOldVal = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const daysOldStr = `You are ${daysOldVal.toLocaleString()} days old today`;

  // ── NIGHT SKY STAR MAP (mathematically calculated, not AI-generated) ──
  const starMap = buildStarMapSvg({ year, month, day, country, size: 168 });
  const moonIlluminationPct = `${Math.round(starMap.illuminationFraction * 100)}%`;

  // ── PRICES TABLE ──
  const pricesHTML = prices.items.map(p => `
    <tr><td>${p.label}</td><td>${p.value}</td></tr>`).join('');

  // ── BORN ON THIS DAY ──
  // The 120-char budget was written against a 120-char AI prompt spec, not
  // against what actually fits the 2-line clamp box (measured ~87 chars).
  const birthdaysHTML = birthdays.slice(0, 4).map((b, i) => `
    <div class="bday"><b>${b.name}</b> &mdash; <span class="desc">${cleanTruncate(b.note, 85)}</span></div>`).join('');

  // ── MUSIC CHART ──
  // Single-line ellipsis truncation (white-space:nowrap + text-overflow)
  // instead of -webkit-line-clamp:1, which combined with the counter
  // pseudo-element left visible fragments of the second line bleeding
  // in above the row's bottom border.
  const chartsHTML = chart.entries.slice(0, 5).map(e => `
    <li><span class="entry-text"><b>${e.title}</b> &mdash; <span class="artist">${e.artist}</span></span></li>`).join('');

  // ── WEATHER CONTENT ──
  // Previously unbounded — always overflowed its 3-line clamp and got cut
  // mid-word by the browser (e.g. "...with avera..."). Shortened the
  // fixed wording too, so a normal-length condition description has room
  // to render complete rather than sitting right at the safety ceiling.
  const weatherText = cleanTruncate(`${weather.season || 'The season'} in ${country}: ${weather.condition || 'typical weather'}, around ${weather.temp || ''}°C.`, 80);

  // ── ALSO ON THIS DAY STORIES (Clipped to OTD slots) ──
  // Budgets below are empirically measured against each box's actual
  // rendered line-clamp capacity (see scratch_renderer_stress_test.js),
  // with a safety margin — not guessed character counts. Going over these
  // causes the CSS line-clamp to hard-cut mid-word/mid-sentence instead of
  // cleanTruncate's sentence-aware cut ever being what the reader sees.
  const otd1Body = cleanTruncate(worldNews[1]?.body || (business[0] ? business[0].body : ''), 165);
  const otd2Body = cleanTruncate(worldNews[2]?.body || (business[1] ? business[1].body : ''), 165);
  const otd3Body = cleanTruncate(worldNews[3]?.body || (localNews[1] ? localNews[1].body : ''), 115);
  const otd1Text = `<b>World:</b> ${otd1Body}`;
  const otd2Text = `<b>Science:</b> ${otd2Body}`;
  const otd3Text = `<b>Culture:</b> ${otd3Body}`;

  // ── SPORT TEXT ──
  const sportText = cleanTruncate(sport[0]?.body || (sport[0]?.headline ? `On this day, ${sport[0].headline}.` : 'Sporting events of the day concluded with high spirits and remarkable achievements across the country.'), 200);

  // ── DEDICATION MESSAGE OVERRIDE ──
  const finalMessage = cleanTruncate(personalMessage ? personalMessage.trim() : (message || ''), 260);

  // ── NEWS STORIES TRUNCATION ──
  const news1Body = cleanTruncate(worldNews[0]?.body || '', 235);
  const news2Body = cleanTruncate(localNews[0]?.body || '', 235);

  // ── HOROSCOPE (previously unbounded — the static copy runs ~350-450
  // characters, always overflowing its 6-line clamp box) ──
  const horoscopeText = cleanTruncate(getVintageHoroscope(astro.starSign.name), 230);

  // ── NAME BANNER ── font size steps down for longer occasion/name
  // combinations (empirically measured, see banner_search.js), and the
  // box still allows a 2-line wrap as a last resort so a very long name
  // is never cut off with an ellipsis.
  const bannerFullText = `${bannerText.toUpperCase()} — ${cleanedRecipientName.toUpperCase()}`;
  const bannerLen = bannerFullText.length;
  const bannerFontSize = bannerLen <= 33 ? 21 : bannerLen <= 36 ? 18 : bannerLen <= 40 ? 16 : bannerLen <= 45 ? 14 : 12;

  // ── LEAD HEADLINE ──
  // Empirically the 2-line clamp at 19pt safely holds ~110 characters of
  // dense text (see scratch_renderer_stress_test.js measurements). The old
  // fixed sentence was ~155 characters BEFORE adding the name, so it
  // overflowed on nearly every keepsake, cutting off wherever the 2-line
  // boundary happened to land — often mid-name. This template is short
  // enough to leave headroom for long names, with a hard safety trim as
  // a backstop so no name length can ever break it.
  const leadHeadline = cleanTruncate(`A Star Arrives: The World Welcomes ${cleanedRecipientName}`, 105);

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
<title>The Tribute Times — ${cleanedRecipientName}</title>
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
  /* Section heights were rebalanced against actual measured content need
     (prices/weather were carrying ~2x the height their content ever uses,
     leaving visible empty gaps, while news/message/horoscope were tight
     enough to invite overflow). Each column's total is unchanged so the
     single-page budget still holds. */
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
    <div class="est">A Personal Record of a Most Remarkable Day &bull; Est. for One Reader Only</div>
  </header>

  <div class="dateline">
    <span data-field="dateline-day">${dateLong}</span>
    <span data-field="dateline-edition">Keepsake Edition &mdash; No. 1 of 1</span>
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
    <div class="name-banner-from" data-field="banner-sender">With Love From ${senderName}</div>
  </div>

  <div class="lead">
    <h2 data-field="lead-headline">${leadHeadline}</h2>
    <div class="sub" data-field="lead-subhead">Born on ${dateFormatted} in ${country} — full report from the day everything changed</div>
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
          <div class="to" data-field="msg-to">For ${cleanedRecipientName}</div>
          <div class="msg" data-field="msg-body">&ldquo;${finalMessage}&rdquo;</div>
          <div class="from" data-field="msg-from">&mdash; With all our love, ${senderName}</div>
        </div>
      </section>
      <section class="s-birthdays">
        <h3>Born On This Day</h3>
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
        <h3>Your Stars &mdash; <span data-field="starsign">${astro.starSign.name}</span></h3>
        <p class="clamp6" data-field="horoscope">${horoscopeText}</p>
      </section>
      <section class="s-sport">
        <h3>Sporting News</h3>
        <p class="clamp6" data-field="sport">${sportText}</p>
      </section>
      <section class="s-starmap">
        <h3>The Night Sky</h3>
        <div class="starmap-graphic">${starMap.svg}</div>
        <div class="starmap-caption" data-field="moon-phase">${astro.moonPhase.name || 'Clear'} Moon &middot; ${moonIlluminationPct} illuminated</div>
        <div class="agecount" data-field="days-old">${daysOldStr}</div>
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

module.exports = { renderNewspaper };
