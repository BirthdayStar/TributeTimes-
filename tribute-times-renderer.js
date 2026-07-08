// ============================================================
// THE TRIBUTE TIMES — HTML RENDERER
// Takes the AI JSON output and builds the complete newspaper HTML
// Version 1.0 — July 2026
// ============================================================

const { getStarSign, getChineseZodiac, getMoonPhase } = require('./tribute-times-ai-prompt');

function renderNewspaper(data, content, fonts) {
  const {
    recipientName, dateFormatted, dateLong, day, month, year,
    country, occasion, bannerText, senderName, stationName,
    edition, currency, age
  } = data;

  const {
    worldNews, localNews, sport, business,
    chart, prices, weather, ticker,
    worldInNumbers, books, cinema, birthdays,
    astro, message
  } = content;

  const { chomsky, poppinsB, poppinsR, dejaVu, dejaVuB, dejaVuI } = fonts;

  // ── MOON SVG ──
  const moonSVG = renderMoonSVG(astro.moonPhase.name);

  // ── STAR MAP SVG ──
  const starMapSVG = `<svg width="18" height="18" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
    <circle cx="16" cy="16" r="14" fill="#0d1b2a" stroke="#111" stroke-width="1.5"/>
    <line x1="8" y1="10" x2="14" y2="14" stroke="#c8a020" stroke-width="0.8" opacity="0.8"/>
    <line x1="14" y1="14" x2="20" y2="11" stroke="#c8a020" stroke-width="0.8" opacity="0.8"/>
    <line x1="20" y1="11" x2="24" y2="16" stroke="#c8a020" stroke-width="0.8" opacity="0.8"/>
    <line x1="14" y1="14" x2="16" y2="20" stroke="#c8a020" stroke-width="0.8" opacity="0.8"/>
    <line x1="16" y1="20" x2="22" y2="23" stroke="#c8a020" stroke-width="0.8" opacity="0.8"/>
    <circle cx="8" cy="10" r="1.2" fill="#fff"/>
    <circle cx="14" cy="14" r="1.5" fill="#fff"/>
    <circle cx="20" cy="11" r="1" fill="#fff"/>
    <circle cx="24" cy="16" r="1" fill="#fff"/>
    <circle cx="16" cy="20" r="1.2" fill="#fff"/>
    <circle cx="5" cy="18" r="0.5" fill="#aaa"/>
    <circle cx="26" cy="8" r="0.5" fill="#aaa"/>
  </svg>`;

  // ── ASTRO PANEL ──
  const astroPanel = `
    <div style="border:1px solid #111;padding:4px;background:#fffdf5;width:130px;">
      <div style="font-family:'PB',sans-serif;font-size:5pt;letter-spacing:1.5px;text-transform:uppercase;text-align:center;border-bottom:1px solid #111;border-top:1px solid #111;padding:1.5px 0;margin-bottom:4px;">Born Under These Signs</div>
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:3px;">
        <div style="display:flex;flex-direction:column;align-items:center;text-align:center;padding:3px 1px;border:0.5px solid #ddd;background:#fff;">
          <div style="font-size:0.9rem;line-height:1;margin-bottom:2px;">${astro.starSign.symbol}</div>
          <div style="font-family:'PB',sans-serif;font-size:4pt;color:#111;line-height:1.2;">${astro.starSign.name}</div>
          <div style="font-family:'DJ',serif;font-size:3.5pt;color:#888;line-height:1.2;font-style:italic;">${astro.starSign.element}<br/>Sign</div>
        </div>
        <div style="display:flex;flex-direction:column;align-items:center;text-align:center;padding:3px 1px;border:0.5px solid #ddd;background:#fff;">
          <div style="font-size:0.9rem;line-height:1;margin-bottom:2px;">${getZodiacEmoji(astro.chineseZodiac.animal)}</div>
          <div style="font-family:'PB',sans-serif;font-size:4pt;color:#111;line-height:1.2;">${astro.chineseZodiac.animal}</div>
          <div style="font-family:'DJ',serif;font-size:3.5pt;color:#888;line-height:1.2;font-style:italic;">Chinese<br/>${year}</div>
        </div>
        <div style="display:flex;flex-direction:column;align-items:center;text-align:center;padding:3px 1px;border:0.5px solid #ddd;background:#fff;">
          ${moonSVG}
          <div style="font-family:'PB',sans-serif;font-size:4pt;color:#111;line-height:1.2;">${astro.moonPhase.name.split(' ')[0]}<br/>${astro.moonPhase.name.split(' ').slice(1).join(' ')}</div>
          <div style="font-family:'DJ',serif;font-size:3.5pt;color:#888;font-style:italic;">Moon</div>
        </div>
        <div style="display:flex;flex-direction:column;align-items:center;text-align:center;padding:3px 1px;border:0.5px solid #ddd;background:#fff;">
          ${starMapSVG}
          <div style="font-family:'PB',sans-serif;font-size:4pt;color:#111;line-height:1.2;">Night<br/>Sky</div>
          <div style="font-family:'DJ',serif;font-size:3.5pt;color:#888;font-style:italic;">${day} ${monthAbbr(month)}</div>
        </div>
      </div>
    </div>`;

  // ── TICKER ──
  const tickerHTML = ticker.map(t => `
    <div class="tick">
      <span class="tn">${t.label}</span>
      <span class="tv">${t.value}</span>
      <span class="${t.direction === 'up' ? 'tu' : t.direction === 'down' ? 'td' : 'tne'}">${t.direction === 'up' ? '▲' : t.direction === 'down' ? '▼' : '―'}</span>
    </div>`).join('');

  // ── WORLD NEWS ──
  const worldNewsHTML = worldNews.map((s, i) => {
    const hedClass = `hed-${s.size || (i === 0 ? 'xl' : i === 1 ? 'md' : 'sm')}`;
    const body2 = s.body2 ? `<div class="lead-col-rule"><div class="copy">${s.body2}</div></div>` : '';
    const inner = i === 0 ? `
      <div class="lead-2col">
        <div><div class="copy drop-cap">${s.body}</div></div>
        ${body2 || `<div class="lead-col-rule"><div class="copy">${s.body}</div></div>`}
      </div>` : `<div class="copy">${s.body}</div>`;
    return `
      ${i > 0 ? '<div class="' + (i === 1 ? 'centre-rule-thick' : 'centre-rule') + '"></div>' : ''}
      <div class="yr">${s.year}</div>
      <div class="${hedClass}">${s.headline}</div>
      ${s.deck ? `<div class="deck">${s.deck}</div>` : ''}
      ${s.byline ? `<div class="byline">${s.byline}</div>` : ''}
      ${inner}`;
  }).join('');

  // ── LOCAL NEWS ──
  const localNewsHTML = localNews.map((s, i) => `
    <div class="mini-item">
      <div class="mini-label">${s.year}</div>
      <div class="hed-${s.size || 'sm'}">${s.headline}</div>
      <div class="copy-sm">${s.body}</div>
    </div>
    ${i < localNews.length - 1 ? '<div class="story-rule"></div>' : ''}`).join('');

  // ── SPORT ──
  const sportHTML = sport.map((s, i) => `
    <div class="right-box${s.boxed ? ' right-box-featured' : ''}">
      <div class="right-box-hdr">${s.year} · ${getSportCategory(s.headline)}</div>
      <div class="hed-sm">${s.headline}</div>
      <div class="byline">${s.byline}</div>
      <div class="copy-sm">${s.body}</div>
    </div>`).join('');

  // ── BUSINESS ──
  const businessHTML = business.map((s, i) => `
    ${i > 0 ? '<div class="story-rule"></div>' : ''}
    <div class="yr">${s.year}</div>
    <div class="hed-${s.size || 'sm'}">${s.headline}</div>
    ${s.byline ? `<div class="byline">${s.byline}</div>` : ''}
    <div class="copy-sm">${s.body}</div>`).join('');

  // ── CHART ──
  const chartHTML = chart.entries.map(e => `
    <div class="chart-row">
      <div class="cnum">${e.position}</div>
      <div><div class="ctit">${e.title}</div><div class="cart">${e.artist}</div></div>
    </div>`).join('');

  // ── PRICES ──
  const pricesHTML = prices.items.map(p => `
    <div class="prow">
      <span class="pitem">${p.label}</span>
      <span class="pval">${p.value}</span>
    </div>`).join('');

  // ── WORLD IN NUMBERS ──
  const numbersHTML = worldInNumbers.map(n => `
    <div class="prow">
      <span class="pitem">${n.label}</span>
      <span class="pval">${n.value}</span>
    </div>`).join('');

  // ── BOOKS ──
  const booksHTML = books.map((b, i) => `
    <div style="${i < books.length-1 ? 'margin-bottom:4px;padding-bottom:4px;border-bottom:0.5px dotted #ccc;' : ''}">
      <div style="font-family:'PB',sans-serif;font-size:6pt;color:#111;">${b.title}</div>
      <div style="font-family:'DJ',serif;font-style:italic;font-size:5pt;color:#666;">${b.author} · ${b.note}</div>
    </div>`).join('');

  // ── CINEMA ──
  const cinemaHTML = cinema.map((f, i) => `
    <div style="${i < cinema.length-1 ? 'margin-bottom:4px;padding-bottom:4px;border-bottom:0.5px dotted #ccc;' : ''}">
      <div style="font-family:'PB',sans-serif;font-size:6pt;color:#111;">${f.title}</div>
      <div style="font-family:'DJ',serif;font-style:italic;font-size:5pt;color:#666;">${f.credit} · ${f.note}</div>
    </div>`).join('');

  // ── BIRTHDAYS ──
  const birthdaysHTML = birthdays.map(b => `
    <div class="fitem">
      <div class="fname">${b.name}</div>
      <div class="fnote">${b.note}</div>
    </div>`).join('');

  // ── SIGNATURE ──
  const sigHTML = edition === 'radio' ? `
    <div class="sig">
      <div class="sblock"><div class="sline"></div><div class="slbl">Signed by ${senderName}</div></div>
      <div class="smsg">${message}</div>
      <div class="sblock"><div class="sline"></div><div class="slbl">Date</div></div>
    </div>` : `
    <div class="sig-simple">
      <div class="gift-from">A ${edition === 'florist' ? 'gift' : 'personal gift'} from ${senderName}</div>
      <div class="smsg">${message}</div>
      ${edition === 'public' ? `<div class="gift-ordered">Ordered at tributetimes.co.nz · © ${new Date().getFullYear()} The Tribute Times</div>` : ''}
    </div>`;

  // ── ROMAN NUMERAL YEAR ──
  const romanYear = toRoman(year);

  // ── FULL HTML ──
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<title>The Tribute Times — ${recipientName}</title>
<style>
${getFontFaces(fonts)}
${getStyles()}
</style>
</head>
<body>
<div id="wrap"><div id="star"><div class="outer-border">

<!-- MASTHEAD -->
<div class="mh">
  <div class="mh-logo">
    <div class="sp-label">Proudly Sponsored By</div>
    <div class="logo-box">
      <div class="logo-name" id="station-logo"><!-- STATION LOGO INJECTED HERE --></div>
    </div>
  </div>
  <div class="mh-centre">
    <div class="mh-pre">★ &nbsp; Your Day. Your Story. &nbsp; ★</div>
    <div class="mh-title">The Tribute Times</div>
    <div class="mh-rule-dbl">AI generated ${occasion.toLowerCase()} keepsake for commemorative purposes &nbsp;·&nbsp; © The Tribute Times</div>
    <div class="mh-established">
      <div class="est-label">Established</div>
      <div class="est-year">${romanYear}</div>
      <div class="est-sub">${monthAbbr(month)} · ${country}</div>
    </div>
  </div>
  <div class="mh-logo">
    <div class="sp-label">Proudly Sponsored By</div>
    <div class="logo-box">
      <div class="logo-name" id="sponsor-logo"><!-- SPONSOR LOGO INJECTED HERE --></div>
    </div>
  </div>
</div>

<!-- EDITION BAR -->
<div class="ebar">
  <span>Special Edition</span>
  <span class="ebar-date">${day}${ordinal(day)} ${monthName(month)}</span>
  <span>Priceless</span>
</div>

<!-- NAMEPLATE -->
<div class="nameplate" style="display:grid;grid-template-columns:1fr 136px;align-items:center;">
  <div style="padding:5px 8px;text-align:center;">
    <div class="np-extra">✦ &nbsp; ${bannerText} &nbsp; ✦</div>
    <div class="np-name">${recipientName}</div>
    <div class="np-sub">Born ${dateFormatted} &nbsp;·&nbsp; ${edition === 'radio' ? `With Love From ${stationName}` : edition === 'florist' ? `A Gift From ${senderName}` : `A Gift From ${senderName}`}</div>
  </div>
  <div style="border-left:1px solid #333;padding:3px;background:#fffdf5;align-self:stretch;display:flex;align-items:center;">
    ${astroPanel}
  </div>
</div>

<!-- INFO BAR -->
<div class="info-bar">
  <div class="info-cell">
    <div class="info-cell-title">Weather · ${country} · ${monthAbbr(month)} ${year}</div>
    <div class="wx-row">
      <div class="wx-icon">${weather.icon}</div>
      <div>
        <div style="display:flex;align-items:baseline;gap:2px;"><div class="wx-temp">${weather.temp}</div><div class="wx-unit">°C</div></div>
        <div class="wx-cond">${weather.condition} · ${weather.season}</div>
      </div>
    </div>
  </div>
  <div class="info-bar-divider"></div>
  <div class="info-cell">
    <div class="info-cell-title">${chart.label} · ${year}</div>
    <div class="info-cell-body">
      <b>#1 ${chart.entries[0].title}</b> — ${chart.entries[0].artist}<br/>
      #2 ${chart.entries[1].title} — ${chart.entries[1].artist}<br/>
      #3 ${chart.entries[2].title} — ${chart.entries[2].artist}<br/>
      #4 ${chart.entries[3].title} — ${chart.entries[3].artist}<br/>
      #5 ${chart.entries[4].title} — ${chart.entries[4].artist}
    </div>
  </div>
  <div class="info-bar-divider"></div>
  <div class="info-cell">
    <div class="info-cell-title">Cost of Living · ${year} · ${country}</div>
    <div class="info-cell-body">
      ${prices.items.map(p => `${p.label}: <b>${p.value}</b>`).join('<br/>')}
    </div>
  </div>
</div>

<!-- TICKER -->
<div class="ticker">
  <div class="tlabel">Markets · ${monthAbbr(month)} ${year}</div>
  <div class="titems">${tickerHTML}</div>
</div>

<!-- DATE INTRO -->
<div class="date-intro">Here are some news stories from your special day &nbsp;(${day}${ordinal(day)} ${monthName(month)}).</div>

<!-- BODY ROW 1 -->
<div class="r1">

  <div class="r1-left">
    <div class="col-hdr">${country}</div>
    ${localNewsHTML}
  </div>

  <div class="r1-centre">
    <div class="extra-headline">✦ &nbsp; Extra &nbsp; Extra &nbsp; Latest &nbsp; News &nbsp; ✦</div>
    <div class="hed-banner">World News — On This Day</div>
    ${worldNewsHTML}
  </div>

  <div class="r1-right">
    <div class="col-hdr">Sport — On This Day</div>
    ${sportHTML}
  </div>

</div>

<!-- BODY ROW 2 -->
<div class="r2">

  <div class="r2-col">
    <div class="col-hdr">Business</div>
    ${businessHTML}
  </div>

  <div class="r2-col">
    <div class="col-hdr">The World in Numbers · ${year}</div>
    ${numbersHTML}
  </div>

  <div class="r2-col">
    <div class="col-hdr">What Were They Reading · ${year}</div>
    ${booksHTML}
  </div>

  <div class="r2-col">
    <div class="col-hdr">At the Cinema · ${year}</div>
    ${cinemaHTML}
  </div>

</div>

<!-- BOTTOM DATA ROW -->
<div class="r3">
  <div class="r3-col">
    <div class="data-hdr">${chart.label} · ${year}</div>
    ${chartHTML}
  </div>
  <div class="r3-div"></div>
  <div class="r3-col">
    <div class="data-hdr">Prices in ${year} · ${country}</div>
    ${pricesHTML}
  </div>
  <div class="r3-div"></div>
  <div class="r3-col">
    <div class="data-hdr">Also Born on ${day}${ordinal(day)} ${monthName(month)}</div>
    ${birthdaysHTML}
  </div>
</div>

<!-- SIGNATURE -->
${sigHTML}

<!-- CLOSER -->
<div class="closer">
  <div class="closer-text">✦ &nbsp; You are part of something much bigger. &nbsp; ✦</div>
</div>

</div></div></div>

<script>
(function(){
  var s=document.getElementById('star'),w=document.getElementById('wrap');
  if(!s||!w)return;
  var a=w.clientWidth-16,pw=s.scrollWidth;
  if(pw>a){s.style.transform='scale('+(a/pw)+')';s.style.marginBottom='-'+Math.round(pw*(1-(a/pw)))+'px';}
})();
</script>
</body>
</html>`;
}

// ── HELPERS ──

function renderMoonSVG(phase) {
  const phases = {
    'New Moon':        'M16,2 A14,14 0 1,0 16,30 A14,14 0 1,0 16,2 Z',
    'Waxing Crescent': 'M16,2 A14,14 0 0,1 16,30 A6,14 0 0,0 16,2 Z',
    'First Quarter':   'M16,2 A14,14 0 0,1 16,30 L16,2 Z',
    'Waxing Gibbous':  'M16,2 A14,14 0 0,1 16,30 A4,14 0 0,1 16,2 Z',
    'Full Moon':       null,
    'Waning Gibbous':  'M16,2 A14,14 0 0,0 16,30 A4,14 0 0,0 16,2 Z',
    'Last Quarter':    'M16,2 A14,14 0 0,0 16,30 L16,2 Z',
    'Waning Crescent': 'M16,2 A14,14 0 0,0 16,30 A6,14 0 0,1 16,2 Z',
  };
  const shadow = phases[phase];
  return `<svg width="18" height="18" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg" style="margin-bottom:2px;">
    <circle cx="16" cy="16" r="14" fill="${phase === 'New Moon' ? '#333' : '#e8e0c8'}" stroke="#111" stroke-width="1.5"/>
    ${shadow ? `<path d="${shadow}" fill="#333"/>` : ''}
    <circle cx="16" cy="16" r="14" fill="none" stroke="#111" stroke-width="1.5"/>
  </svg>`;
}

function getZodiacEmoji(animal) {
  const map = {Monkey:'🐒',Rooster:'🐓',Dog:'🐕',Pig:'🐖',Rat:'🐀',Ox:'🐂',
                Tiger:'🐯',Rabbit:'🐰',Dragon:'🐉',Snake:'🐍',Horse:'🐴',Goat:'🐐'};
  return map[animal] || '🌟';
}

function getSportCategory(headline) {
  const h = headline.toLowerCase();
  if (h.includes('rugby') || h.includes('all blacks') || h.includes('springbok')) return 'Rugby';
  if (h.includes('cricket') || h.includes('test match') || h.includes('odi')) return 'Cricket';
  if (h.includes('football') || h.includes('soccer') || h.includes('cup')) return 'Football';
  if (h.includes('boxing') || h.includes('pacquiao')) return 'Boxing';
  if (h.includes('basketball') || h.includes('nba')) return 'Basketball';
  if (h.includes('athletics') || h.includes('marathon')) return 'Athletics';
  return 'Sport';
}

function monthName(month) {
  return ['January','February','March','April','May','June',
          'July','August','September','October','November','December'][month-1];
}

function monthAbbr(month) {
  return ['Jan','Feb','Mar','Apr','May','Jun',
          'Jul','Aug','Sep','Oct','Nov','Dec'][month-1];
}

function ordinal(n) {
  const s = ['th','st','nd','rd'];
  const v = n % 100;
  return s[(v-20)%10]||s[v]||s[0];
}

function toRoman(num) {
  const val = [1000,900,500,400,100,90,50,40,10,9,5,4,1];
  const rom = ['M','CM','D','CD','C','XC','L','XL','X','IX','V','IV','I'];
  let result = '';
  for(let i=0;i<val.length;i++) while(num>=val[i]){result+=rom[i];num-=val[i];}
  return result;
}

function getFontFaces(fonts) {
  return `
@font-face{font-family:'Chomsky';src:url('data:font/otf;base64,${fonts.chomsky}') format('opentype');}
@font-face{font-family:'PB';src:url('data:font/ttf;base64,${fonts.poppinsB}') format('truetype');font-weight:700;}
@font-face{font-family:'PR';src:url('data:font/ttf;base64,${fonts.poppinsR}') format('truetype');font-weight:400;}
@font-face{font-family:'DJ';src:url('data:font/ttf;base64,${fonts.dejaVu}') format('truetype');font-weight:400;font-style:normal;}
@font-face{font-family:'DJ';src:url('data:font/ttf;base64,${fonts.dejaVuB}') format('truetype');font-weight:700;font-style:normal;}
@font-face{font-family:'DJ';src:url('data:font/ttf;base64,${fonts.dejaVuI}') format('truetype');font-weight:400;font-style:italic;}`;
}

function getStyles() {
  // Copied from tribute-times-v2/design-reference.html <style> block,
  // excluding the six @font-face rules (those come from getFontFaces() above).
  return `
*{margin:0;padding:0;box-sizing:border-box;}
body{background:#888;display:flex;flex-direction:column;align-items:center;padding:20px 12px 60px;}
.note{font-family:'PR',sans-serif;font-size:0.65rem;letter-spacing:0.2em;color:#ddd;margin-bottom:14px;text-align:center;text-transform:uppercase;}
#wrap{width:100%;display:flex;justify-content:center;}
#star{
  background:#fffdf5;
  color:#111;
  width:210mm;
  flex-shrink:0;
  transform-origin:top center;
  border:3px double #111;
  box-shadow:0 8px 40px rgba(0,0,0,0.5);
  font-family:'DJ',serif;
  padding:0;
}

/* ══ ORNATE BORDER ══ */
.outer-border{
  border:1.5px solid #111;
  margin:4px;
  padding:0;
}

/* ══ MASTHEAD ══ */
.mh{
  border-bottom:3px double #111;
  padding:6px 8px 4px;
  text-align:center;
  background:#fffdf5;
  position:relative;
}
.mh-pre{
  font-family:'PB',sans-serif;
  font-size:7pt;letter-spacing:5px;
  text-transform:uppercase;color:#555;
  margin-bottom:2px;
}
.mh-title{
  font-family:'Chomsky',serif;
  font-size:62px;
  line-height:0.88;
  color:#111;
  letter-spacing:2px;
}
.mh-rule-dbl{
  border-top:3px double #111;
  border-bottom:1px solid #111;
  padding:2px 0;
  margin:4px 0;
  font-family:'PR',sans-serif;
  font-size:4pt;color:#888;
  letter-spacing:0.5px;
  text-align:center;
}
.mh-logos{
  display:flex;justify-content:space-between;align-items:center;
  padding:0 6px;
  margin-top:3px;
}
.mh-logo-box{
  border:1px solid #ccc;
  padding:4px 6px;
  text-align:center;
  min-width:80px;
}
.mh-logo-label{font-family:'PR',sans-serif;font-size:5pt;color:#888;text-transform:uppercase;letter-spacing:0.1em;}
.mh-logo-name{font-family:'PB',sans-serif;font-size:7pt;color:#111;line-height:1.2;}
.mh-logo-sub{font-family:'PR',sans-serif;font-size:4.5pt;color:#888;}

/* ══ EDITION BAR ══ */
.ebar{
  display:flex;justify-content:space-between;align-items:center;
  padding:2px 8px;
  border-bottom:2px solid #111;
  border-top:2px solid #111;
  font-family:'PB',sans-serif;
  font-size:6.5pt;letter-spacing:0.5px;
  background:#111;color:#fffdf5;
}

/* ══ NAMEPLATE ══ */
.nameplate{
  text-align:center;
  padding:5px 8px;
  border-bottom:3px double #111;
  background:#fffdf5;
}
.np-extra{
  font-family:'PB',sans-serif;
  font-size:7pt;letter-spacing:4px;
  text-transform:uppercase;color:#555;
  margin-bottom:2px;
}
.np-name{
  font-family:'Chomsky',serif;
  font-size:2rem;
  line-height:1;color:#111;
}
.np-sub{
  font-family:'PR',sans-serif;
  font-size:5pt;letter-spacing:0.3em;
  color:#888;margin-top:2px;
}

/* ══ INFO BAR ══ */
.info-bar{
  display:grid;grid-template-columns:1fr 2px 1fr 2px 1fr;
  border-bottom:2px solid #111;
}
.info-bar-divider{background:#111;}
.info-cell{padding:4px 7px;}
.info-cell-title{
  font-family:'PB',sans-serif;font-size:5.5pt;
  letter-spacing:0.5px;text-transform:uppercase;
  border-bottom:0.5px solid #111;padding-bottom:1px;margin-bottom:2px;
}
.info-cell-body{font-family:'DJ',serif;font-size:5.5pt;color:#333;line-height:1.6;}
.info-cell-body b{font-weight:700;color:#111;}
.wx-row{display:flex;align-items:center;gap:4px;}
.wx-icon{font-size:1.4rem;line-height:1;}
.wx-temp{font-family:'PB',sans-serif;font-size:16pt;color:#111;line-height:1;}
.wx-unit{font-family:'PR',sans-serif;font-size:7pt;color:#666;}
.wx-cond{font-family:'DJ',serif;font-size:5pt;color:#555;margin-top:1px;font-style:italic;}

/* ══ TICKER ══ */
.ticker{
  background:#111;color:#fffdf5;
  padding:3px 8px;
  border-bottom:1px solid #111;
  display:flex;align-items:center;
  white-space:nowrap;overflow:hidden;
}
.tlabel{font-family:'PB',sans-serif;font-size:5.5pt;letter-spacing:1.5px;text-transform:uppercase;color:#c8a020;margin-right:10px;flex-shrink:0;border-right:1px solid #444;padding-right:10px;}
.titems{display:flex;flex:1;overflow:hidden;}
.tick{display:flex;align-items:center;gap:3px;padding:0 8px;border-right:1px solid #333;}
.tick:last-child{border-right:none;}
.tn{color:#aaa;font-size:5pt;font-family:'PR',sans-serif;}
.tv{color:#fffdf5;font-family:'PB',sans-serif;font-size:6pt;}
.tu{color:#90ee90;}
.td{color:#ff9090;}

/* ══ DATE INTRO ══ */
.date-intro{
  text-align:center;
  padding:3px 8px;
  border-bottom:1px solid #111;
  font-family:'DJ',serif;font-style:italic;
  font-size:8pt;color:#444;
}

/* ══ MAIN BODY — genuine mosaic layout ══ */
.body-wrap{padding:0 0;}

/* Row 1: Left narrow + Centre wide lead + Right narrow */
.r1{display:grid;grid-template-columns:38mm 1fr 38mm;border-bottom:2px solid #111;min-height:120mm;}
.r1-left{border-right:1.5px solid #111;padding:6px;}
.r1-centre{border-right:1.5px solid #111;padding:6px 8px;}
.r1-right{padding:6px;}

/* Row 2: Four unequal columns */
.r2{display:grid;grid-template-columns:1fr 1.4fr 1fr 0.8fr;border-bottom:2px solid #111;}
.r2-col{padding:6px 7px;border-right:1px solid #ccc;}
.r2-col:last-child{border-right:none;}

/* Row 3: Bottom data strip */
.r3{display:grid;grid-template-columns:1fr 2px 1fr 2px 1fr;border-bottom:2px solid #111;}
.r3-div{background:#111;}
.r3-col{padding:5px 7px;}

/* ══ TYPOGRAPHY ══ */
.col-hdr{
  font-family:'PB',sans-serif;font-size:6pt;
  letter-spacing:1.5px;text-transform:uppercase;
  border-bottom:2px solid #111;
  padding-bottom:2px;margin-bottom:5px;
  text-align:center;
}
.yr{
  font-family:'PB',sans-serif;font-size:5pt;
  color:#fffdf5;background:#111;
  display:inline-block;padding:1px 4px;
  margin-bottom:2px;letter-spacing:0.3px;
}
.extra-headline{
  font-family:'PB',sans-serif;
  font-size:7pt;letter-spacing:4px;
  text-transform:uppercase;color:#555;
  text-align:center;margin-bottom:2px;
}
.hed-banner{
  font-family:'PB',sans-serif;
  font-size:6pt;letter-spacing:3px;
  text-transform:uppercase;
  border-top:1px solid #111;border-bottom:1px solid #111;
  padding:2px 0;text-align:center;
  color:#111;margin-bottom:4px;
}
/* Drop cap */
.drop-cap::first-letter{
  font-family:'Chomsky',serif;
  font-size:3.2rem;
  float:left;
  line-height:0.75;
  margin-right:3px;
  margin-top:2px;
  color:#111;
}
.hed-xl{font-family:'Chomsky',serif;font-size:28pt;color:#111;line-height:0.95;margin-bottom:3px;}
.hed-lg{font-family:'PB',sans-serif;font-size:11pt;color:#111;line-height:1.1;margin-bottom:3px;}
.hed-lg-chomsky{font-family:'Chomsky',serif;font-size:14pt;color:#111;line-height:1.05;margin-bottom:3px;}
.hed-md{font-family:'PB',sans-serif;font-size:8.5pt;color:#111;line-height:1.15;margin-bottom:2px;}
.hed-sm{font-family:'PB',sans-serif;font-size:7pt;color:#111;line-height:1.2;margin-bottom:2px;}
.hed-xs{font-family:'PB',sans-serif;font-size:5.5pt;color:#111;line-height:1.2;margin-bottom:1px;}
.deck{font-family:'DJ',serif;font-style:italic;font-size:7pt;color:#555;margin-bottom:3px;line-height:1.3;}
.byline{font-family:'PR',sans-serif;font-size:4.5pt;letter-spacing:0.2em;color:#999;text-transform:uppercase;margin-bottom:4px;}
.copy{font-family:'DJ',serif;font-size:6pt;color:#222;line-height:1.7;text-align:justify;}
.copy+.copy{margin-top:4px;}
.copy-sm{font-family:'DJ',serif;font-size:5.5pt;color:#333;line-height:1.65;text-align:justify;}
.story-rule{border-top:1px solid #bbb;margin:5px 0;}
.story-rule-thick{border-top:2px solid #111;margin:5px 0;}
.story-rule-dbl{border-top:3px double #111;margin:5px 0;}

/* Left column mini-items */
.mini-item{margin-bottom:6px;padding-bottom:6px;border-bottom:0.5px solid #ccc;}
.mini-item:last-child{border-bottom:none;margin-bottom:0;padding-bottom:0;}
.mini-label{font-family:'PB',sans-serif;font-size:5pt;letter-spacing:2px;text-transform:uppercase;color:#888;margin-bottom:1px;}

/* ── Right column boxes ── */
.right-box{
  border:1px solid #111;
  padding:5px;
  margin-bottom:6px;
}
.right-box:last-child{margin-bottom:0;}
.right-box-hdr{
  background:#111;color:#fffdf5;
  font-family:'PB',sans-serif;font-size:5.5pt;
  letter-spacing:1px;text-transform:uppercase;
  padding:2px 4px;margin:-5px -5px 4px;
  text-align:center;
}

/* ── Lead story 2-col internal ── */
.lead-2col{
  display:grid;grid-template-columns:1fr 1fr;
  gap:0;column-gap:8px;
}
.lead-col-rule{border-left:0.5px solid #ccc;padding-left:8px;}

/* ── Centre mid-rule ── */
.centre-rule{
  border-top:3px double #111;
  margin:6px 0 4px;
}

/* Signature */
.sig{display:grid;grid-template-columns:1fr 2fr 1fr;gap:8px;align-items:end;padding:5px 8px 4px;border-bottom:1px solid #ccc;}
.sblock{text-align:center;}
.sline{border-bottom:1px solid #111;height:18px;}
.slbl{font-family:'PR',sans-serif;font-size:4.5pt;letter-spacing:0.2em;color:#bbb;margin-top:1px;text-transform:uppercase;}
.smsg{font-family:'DJ',serif;font-style:italic;font-size:6pt;color:#555;line-height:1.5;text-align:center;}

/* Closer */
.closer{text-align:center;padding:4px 8px;border-top:1px solid #ccc;}
.closer-text{font-family:'DJ',serif;font-style:italic;font-size:6.5pt;color:#888;letter-spacing:1px;}

/* Chart / prices / bdays in ad-like boxes */
.data-hdr{
  font-family:'PB',sans-serif;font-size:6pt;letter-spacing:1px;
  text-transform:uppercase;text-align:center;
  border-bottom:2px solid #111;border-top:2px solid #111;
  padding:2px 0;margin-bottom:4px;
}
.chart-row{display:flex;align-items:baseline;gap:4px;border-bottom:0.5px dotted #ccc;padding:1.5px 0;}
.chart-row:last-child{border-bottom:none;}
.cnum{font-family:'PB',sans-serif;font-size:8pt;color:#111;width:12px;flex-shrink:0;}
.ctit{font-family:'PB',sans-serif;font-size:6pt;color:#111;}
.cart{font-family:'DJ',serif;font-style:italic;font-size:5pt;color:#666;}
.prow{display:flex;justify-content:space-between;border-bottom:0.5px dotted #ccc;padding:1.5px 0;}
.pitem{font-family:'DJ',serif;font-size:5.5pt;color:#444;}
.pval{font-family:'PB',sans-serif;font-size:5.5pt;color:#111;}
.fitem{border-bottom:0.5px dotted #ccc;padding:2px 0;}
.fitem:last-child{border-bottom:none;}
.fname{font-family:'PB',sans-serif;font-size:6pt;color:#111;}
.fnote{font-family:'DJ',serif;font-style:italic;font-size:4.5pt;color:#666;line-height:1.4;}

@media print{
  body{background:white;padding:0;}
  .note{display:none;}
  #star{box-shadow:none;width:210mm;transform:none!important;margin-bottom:0!important;}
}
`;
}

module.exports = { renderNewspaper };
