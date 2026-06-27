// ══════════════════════════════════════════
//  URL OBFUSCATION — XOR cipher with session key
//  URLs are NEVER stored as plain strings in memory
// ══════════════════════════════════════════
const _K = Array.from({length: 32}, () => Math.floor(Math.random() * 256));

function _enc(str) {
  if (!str) return '';
  const bytes = new TextEncoder().encode(str);
  const out = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) out[i] = bytes[i] ^ _K[i % _K.length];
  return btoa(String.fromCharCode(...out));
}

function _dec(enc) {
  if (!enc) return '';
  try {
    const bytes = Uint8Array.from(atob(enc), c => c.charCodeAt(0));
    const out = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) out[i] = bytes[i] ^ _K[i % _K.length];
    return new TextDecoder().decode(out);
  } catch { return ''; }
}

// Proxy wrapper — adds indirection layer so real URL is hidden from sniffer
const _PX = _enc('https://corsproxy.io/?url=');
function _proxyUrl(rawEncoded) {
  return _dec(_PX) + encodeURIComponent(_dec(rawEncoded));
}

// ══════════════════════════════════════════
//  DB URLS (base64 encoded, then XOR'd)
// ══════════════════════════════════════════
const _DB = {
  active:   _enc(atob('aHR0cHM6Ly9yYXcuZ2l0aHVidXNlcmNvbnRlbnQuY29tL1phbWFuLVRvcHUvSXAtdHYtQ29sbGVjdGlvbi9tYWluL0ZJTkFMX0lQVFZfQUNUSVZFLm0zdQ==')),
  geo:      _enc(atob('aHR0cHM6Ly9yYXcuZ2l0aHVidXNlcmNvbnRlbnQuY29tL1phbWFuLVRvcHUvSXAtdHYtQ29sbGVjdGlvbi9tYWluL0ZJTkFMX0lQVFZfR0VPLm0zdQ==')),
  complete: _enc(atob('aHR0cHM6Ly9yYXcuZ2l0aHVidXNlcmNvbnRlbnQuY29tL1phbWFuLVRvcHUvSXAtdHYtQ29sbGVjdGlvbi9tYWluL0ZJTkFMX0lQVFZfQ09NUExFVEUubTN1')),
};
const _STURL = _enc(atob('aHR0cHM6Ly9yYXcuZ2l0aHVidXNlcmNvbnRlbnQuY29tL1phbWFuLVRvcHUvSXAtdHYtQ29sbGVjdGlvbi9tYWluL2NoYW5uZWxfc3RhdHVzLmpzb24='));

// ══════════════════════════════════════════
//  MOVIE GROUP FILTER — exclude these
// ══════════════════════════════════════════
const MOVIE_KEYWORDS = ['movie','movies','film','films','cinema','vod','series'];
function isMovieGroup(group) {
  const g = (group || '').toLowerCase();
  return MOVIE_KEYWORDS.some(k => g.includes(k));
}

// ══════════════════════════════════════════
//  STATE
// ══════════════════════════════════════════
let allCh     = [];   // channels with encoded URLs
let filtered  = [];
let statusMap = {};
let page      = 1;
const PER     = 60; // Optimized page size for lower DOM weight on low-end devices
let activeCh  = null;
let hlsInst   = null;
let srchTimer = null;
let dbKey     = 'complete';
const countryCache = {}; // Cache country detections
let uniqueCats = [];
let uniqueCountries = [];

let fSearch  = '';
let fCat     = 'all';
let fCountry = 'all';

// ══════════════════════════════════════════
//  DOM
// ══════════════════════════════════════════
const grid     = document.getElementById('grid');
const pages    = document.getElementById('pages');
const statC    = document.getElementById('stat-c');
const statT    = document.getElementById('stat-t');
const srchEl   = document.getElementById('srch');
const selDb    = document.getElementById('sel-db');
const selCat   = document.getElementById('sel-cat');
const cpills   = document.getElementById('cpills');
const qpills   = document.getElementById('qpills');
const breset   = document.getElementById('breset');

const pWrap    = document.getElementById('player-wrap');
const vidEl    = document.getElementById('vid');
const pClose   = document.getElementById('p-close');
const pErr     = document.getElementById('p-err');
const errTxt   = document.getElementById('err-txt');
const btnProxy = document.getElementById('btn-proxy');
const btnReport = document.getElementById('btn-report');
const piLogo   = document.getElementById('pi-logo');
const piTitle  = document.getElementById('pi-title');
const piCountry= document.getElementById('pi-country');
const piCat    = document.getElementById('pi-cat');
const qList    = document.getElementById('q-list');
const qCnt     = document.getElementById('q-cnt');

// ══════════════════════════════════════════
//  DYNAMIC FALLBACK LOGO
// ══════════════════════════════════════════
function getFallback(name) {
  const l = name ? name.trim().charAt(0).toUpperCase() : 'T';
  const colors = ['#e11d48', '#2563eb', '#16a34a', '#d97706', '#9333ea', '#0891b2', '#be123c', '#0f766e', '#b45309'];
  const hash = name ? name.split('').reduce((a, b) => a + b.charCodeAt(0), 0) : 0;
  const c = colors[hash % colors.length];
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='80' height='50'><rect width='80' height='50' rx='4' fill='${c}'/><text x='50%' y='55%' dominant-baseline='middle' text-anchor='middle' font-family='sans-serif' font-size='24' font-weight='bold' fill='#ffffff'>${l}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}
window.getFallback = getFallback;

function logoSrc(url, name) {
  if (!url) return getFallback(name);
  if (location.protocol === 'https:' && url.startsWith('http://')) {
    // Proxy HTTP images through wsrv.nl to bypass Mixed Content restrictions
    return `https://wsrv.nl/?url=${encodeURIComponent(url)}`;
  }
  return url;
}
// ══════════════════════════════════════════
//  COMPREHENSIVE COUNTRY DETECTION
// ══════════════════════════════════════════

// Explicit group → country mapping
const GROUP_COUNTRY = {
  'bangladesh': 'Bangladesh',
  'akash go': 'Bangladesh',
  'bangla': 'Bangladesh',
  'bdix': 'Bangladesh',
  'bd': 'Bangladesh',
  'indian bangla': 'India',
  'india': 'India',
  'hindi': 'India',
  'pakistan': 'Pakistan',
  'uk': 'UK',
  'usa': 'USA',
  'france': 'France',
  'germany': 'Germany',
  'italy': 'Italy',
  'spain': 'Spain',
  'turkey': 'Turkey',
  'arabic': 'Arabic',
  'arab': 'Arabic',
  'russia': 'Russia',
  'china': 'China',
  'japan': 'Japan',
};

// BD channel name keywords (channels that are from Bangladesh regardless of group)
const BD_NAMES = [
  'btv','btv world','btv national','bangladesh television',
  'somoy tv','somoy news','shomoy',
  'jamuna tv','jamuna news',
  'ntv bangla', 'ntv bd',
  'channel i','channel-i',
  'desh tv','desh bangla','desh bideshe','deshe bideshe',
  'boishakhi tv','boishakhi',
  'rtv bd','rtv bangla',
  'gazi tv','gazi',
  'satv','sa tv','sa-tv',
  'banglavision','bangla vision',
  'mytvbd','my tv bd','my tv bangla',
  'deepto tv','deepto',
  'ekattor tv','ekattor',
  'independent tv','independent television',
  'news24 bd','news 24 bd',
  'channel 24 bd','channel24',
  'maasranga','maas ranga',
  'channel 9 bangla','channel nine bd',
  'gsatv','gaan bangla','gaan tv',
  't sports','tsports','t-sports',
  'time television bd',
  'bijoy tv','bijoy bangla',
  'nagorik tv',
  '71 tv','71tv',
  'baul tv',
  'peace tv bangla','peace bangla',
  'quraner alo','quraaner alo','quran tv bangla',
  'dbc news',
  'atv bangla','atv news bangla',
  'atn bangla','atn news',
  'ekushey tv','ekushe tv',
  'bbc bangla',
  'channel s bangla','channel-s',
  'duronto tv',
  'asia tv bd',
  'abc radio bangla',
  'madani channel bangla',
  'islamic tv bangla',
  'channel 16 bd',
  'sunny tv bd',
  'nexus television',
  'asia pacific tv',
  'bd news 24','bdnews24',
  'nbc bangla','nbc bd',
  'chhannel i','channeli',
  'jago bd','jago bangla',
  'radio today',
  'islamic channel bd',
  'shanta vision',
  'dip tv',
  'music bangla',
  'sangbad pratidin tv',
  'bd sports',
  'toffee tv',
];

// India channel name keywords
const IN_NAMES = [
  'star plus','star gold','star bharat','star vijay',
  'star jalsha','star pravah','star suvarna',
  'zee tv','zee cinema','zee bangla','zee news','zee anmol',
  'zee business','zee punjabi','zee 24 taas',
  'sony','sony liv','sony max','sony sab','sony ten',
  'colors','colors tv','colors bangla','colors marathi','colors gujarati',
  'sun tv','sun news','sun music','sun nxt',
  'dd national','dd sports','dd news','dd bharati',
  'aaj tak','india today','india tv',
  'ndtv','ndtv india','ndtv 24x7',
  'republic tv','republic bharat',
  'times now','mirror now','et now',
  'asianet','asianet news','asianet movies',
  'manorama','mazhavil manorama',
  'vijay tv','kalaignar tv','jaya tv',
  'star sports','star sports 1','star sports 2','star sports 3',
  'jio cinema','hotstar','jio tv',
  'puthuyugam','polimer',
  'mtv india','vh1 india',
  'nick india','cartoon network india',
  'discovery india','nat geo india',
  'comedy central india',
  'cnbc tv18','cnbc awaaz',
  'tv9','tv9 bharatvarsh','tv9 gujarat',
  'news18','news18 india',
  'sahara one','sab tv',
  'dangal tv','rishtey','rishtey cineplex',
  'b4u movies','b4u music',
  'zing tv',
  'bindass',
  'animax india',
  'tata sky',
  'd sports india',
  'ten sports india',
  'ten cricket',
  'p7 news',
];

// Pakistan channel keywords  
const PK_NAMES = [
  'geo news','geo tv','geo entertainment','geo tez',
  'ary news','ary digital','ary musiqe','ary zindagi',
  'hum tv','hum news','hum sitaray',
  'ten sports pk','ptv home','ptv sports','ptv news','ptv world',
  'a plus','aplus tv',
  'samaa tv','samaa news',
  'express news','express tv','express entertainment',
  'capital tv pk','neo news','neo tv',
  'such tv','voice of america urdu',
  'dunya news','dunya tv',
  'pakistan tv','pak tv',
];

const GROUP_COUNTRY_KEYS = Object.keys(GROUP_COUNTRY);

function detectCountry(group, name, url) {
  const cacheKey = `${group || ''}|${name || ''}`;
  if (countryCache[cacheKey]) return countryCache[cacheKey];

  const g = (group || '').toLowerCase().trim();
  const n = (name  || '').toLowerCase().trim();
  const u = (url   || '').toLowerCase();

  let country = 'Global';
  
  // 1. Explicit group match first
  for (let i = 0; i < GROUP_COUNTRY_KEYS.length; i++) {
    const key = GROUP_COUNTRY_KEYS[i];
    if (g === key || g.startsWith(key + ' ') || g.includes(key)) {
      country = GROUP_COUNTRY[key];
      break;
    }
  }

  if (country === 'Global') {
    // 2. Bangladesh channel name check
    for (let i = 0; i < BD_NAMES.length; i++) {
      if (n.includes(BD_NAMES[i])) { country = 'Bangladesh'; break; }
    }
  }

  if (country === 'Global') {
    // 3. India channel name check
    for (let i = 0; i < IN_NAMES.length; i++) {
      if (n.includes(IN_NAMES[i])) { country = 'India'; break; }
    }
  }

  if (country === 'Global') {
    // 4. Pakistan channel name check
    for (let i = 0; i < PK_NAMES.length; i++) {
      if (n.includes(PK_NAMES[i])) { country = 'Pakistan'; break; }
    }
  }

  if (country === 'Global') {
    // 5. URL-based detection
    if (u.includes('sonarbanglatv') || u.includes('aynaott') || u.includes('jagobd') ||
        u.includes('toffeelive') || u.includes('bioscopelive') || u.includes('boishakhi') ||
        u.includes('gpcdn') || u.includes('ncare.live') ||
        u.includes('.com.bd') || u.includes('.net.bd') || u.includes('.org.bd')) {
      country = 'Bangladesh';
    }
  }

  if (country === 'Global') {
    // 6. Keyword checks in name for other countries
    if (n.includes('uk') || n.includes('bbc') || n.includes('itv') || n.includes('sky') || n.includes('channel 4') || n.includes('channel 5')) country = 'UK';
    else if (n.includes('espn') || n.includes('nbc') || n.includes('cbs') || n.includes('abc news') || n.includes('cnn') || n.includes('fox news') || n.includes('hbo') || n.includes(' usa') || n.includes('american')) country = 'USA';
    else if (n.includes('france') || n.includes('tf1') || n.includes('m6 ') || n.includes('bfm')) country = 'France';
    else if (n.includes('ard ') || n.includes('zdf') || n.includes('rtl') || n.includes('deutsch') || n.includes('german')) country = 'Germany';
    else if (n.includes('rai ') || n.includes('mediaset') || n.includes('italia') || n.includes('canale 5')) country = 'Italy';
    else if (n.includes('trt') || n.includes('turkey') || n.includes('turk') || n.includes('show tv')) country = 'Turkey';
    else if (n.includes('arabic') || n.includes('aljazeera') || n.includes('al jazeera') || n.includes('al arabiya') || n.includes('mbc') || n.includes('al hayat')) country = 'Arabic';
    else if (n.includes('russia') || n.includes('russian') || n.includes('rt ') || n.includes('ntv ')) country = 'Russia';
  }

  countryCache[cacheKey] = country;
  return country;
}

// Subcategory detection from group name
function detectSubCategory(group) {
  const g = (group || '').toLowerCase();
  if (g.includes('sport') || g.includes('cricket') || g.includes('football') || g.includes('fifa') || g.includes('world cup')) return 'Sports';
  if (g.includes('news') || g.includes('news24') || g.includes('international news')) return 'News';
  if (g.includes('natok') || g.includes('drama') || g.includes('entertainment') || g.includes('serial')) return 'Natok/Drama';
  if (g.includes('kid') || g.includes('cartoon') || g.includes('animation') || g.includes('baby')) return 'Kids';
  if (g.includes('religio') || g.includes('islam') || g.includes('quran') || g.includes('islamic') || g.includes('peace tv') || g.includes('church') || g.includes('hindu')) return 'Religious';
  if (g.includes('music') || g.includes('song') || g.includes('gaan')) return 'Music';
  if (g.includes('doc') || g.includes('discovery') || g.includes('nat geo') || g.includes('animal')) return 'Documentary';
  if (g.includes('education') || g.includes('learning')) return 'Education';
  if (g.includes('bangla') || g.includes('bangladesh') || g.includes('bd')) return 'General';
  if (g.includes('india') || g.includes('hindi')) return 'General';
  if (g.includes('movie') || g.includes('cinema') || g.includes('film')) return 'Movies';
  return 'General';
}


function detectServer(url) {
  try {
    const h = new URL(url).hostname.replace('www.','');
    if (h.includes('toffeelive')) return 'Toffee';
    if (h.includes('bioscopelive')) return 'Bioscope';
    if (h.includes('github')) return 'GitHub';
    if (h.includes('cloudfront')) return 'CloudFront';
    const parts = h.split('.');
    return parts.length > 1 ? parts[parts.length-2] : h;
  } catch { return 'CDN'; }
}
function isPrivateIp(url) {
  try {
    const p = new URL(url).hostname.split('.').map(Number);
    if (p.length !== 4) return false;
    return p[0]===10||p[0]===127||(p[0]===192&&p[1]===168)||(p[0]===172&&p[1]>=16&&p[1]<=31)||url.includes('localhost');
  } catch { return false; }
}

// ══════════════════════════════════════════
//  M3U PARSER — stores URLs XOR-encoded asynchronously
// ══════════════════════════════════════════
async function parseM3UAsync(text, onProgress) {
  const out = [];
  const lines = text.split('\n');
  let cur = null;
  const total = lines.length;
  
  // Parse in chunks to keep UI responsive
  const chunkSize = 2000;
  for (let i = 0; i < total; i += chunkSize) {
    const end = Math.min(i + chunkSize, total);
    for (let j = i; j < end; j++) {
      const line = lines[j].trim();
      if (!line) continue;
      
      if (line.startsWith('#EXTINF:')) {
        let logo = '';
        const logoIdx = line.indexOf('tvg-logo=');
        if (logoIdx !== -1) {
          const start = logoIdx + 9;
          const quote = line.charAt(start);
          if (quote === '"' || quote === "'") {
            const closing = line.indexOf(quote, start + 1);
            if (closing !== -1) logo = line.substring(start + 1, closing);
          } else {
            let spaceIdx = line.indexOf(' ', start);
            let commaIdx = line.indexOf(',', start);
            let endIdx = spaceIdx === -1 ? commaIdx : (commaIdx === -1 ? spaceIdx : Math.min(spaceIdx, commaIdx));
            logo = endIdx === -1 ? line.substring(start) : line.substring(start, endIdx);
          }
        }
        if (logo && logo.startsWith('http://')) {
          logo = 'https://wsrv.nl/?url=' + encodeURIComponent(logo);
        }

        let group = 'Others';
        const groupIdx = line.indexOf('group-title=');
        if (groupIdx !== -1) {
          const start = groupIdx + 12;
          const quote = line.charAt(start);
          if (quote === '"' || quote === "'") {
            const closing = line.indexOf(quote, start + 1);
            if (closing !== -1) group = line.substring(start + 1, closing).trim();
          }
        }
        
        if (isMovieGroup(group)) { cur = null; continue; }
        
        const ci = line.lastIndexOf(',');
        const chanName = ci >= 0 ? line.substring(ci + 1).trim() : 'Unknown';
        if (chanName.toLowerCase().includes('playz tv')) { cur = null; continue; }
        
        cur = { logo, group, name: chanName || 'Unknown' };
      } else if (cur && (line.startsWith('http') || line.startsWith('rtmp') || line.startsWith('rtsp'))) {
        if (line.includes('/enc/') || line.includes('cenc')) { cur = null; continue; }
        cur._u = _enc(line);
        cur.country = detectCountry(cur.group, cur.name, line);
        cur.subcat = detectSubCategory(cur.group);
        cur.server = detectServer(line);
        out.push(cur);
        cur = null;
      }
    }
    
    if (onProgress) {
      onProgress(Math.min(100, Math.round((end / total) * 100)));
    }
    await new Promise(r => setTimeout(r, 0)); // Yield to main thread
  }
  return out;
}

// ══════════════════════════════════════════
//  FETCH
// ══════════════════════════════════════════
async function fetchPL(encUrl) {
  const url = _dec(encUrl);
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 12000);
    const r = await fetch(url, { signal: ctrl.signal });
    clearTimeout(t);
    const rawText = await r.text();
    const progEl = document.getElementById('load-prog-msg');
    return await parseM3UAsync(rawText, (pct) => {
      if (progEl) progEl.textContent = `Parsing channels... ${pct}%`;
    });
  } catch { return []; }
}

async function fetchStatus() {
  try {
    const r = await fetch(_dec(_STURL) + '?t=' + Date.now());
    if (r.ok) {
      const raw = await r.json();
      // Store status map with encoded keys for obfuscation
      const enc = {};
      for (const [k,v] of Object.entries(raw)) enc[_enc(k)] = v;
      statusMap = enc;
    }
  } catch {}
}

function getStatus(ch) {
  return statusMap[ch._u] || 'unknown';
}

// ══════════════════════════════════════════
//  FILTERS
// ══════════════════════════════════════════
const COUNTRIES = ['Bangladesh','India','Pakistan','UK','USA','France','Germany','Italy','Turkey','Arabic','Russia','Global'];
const FLAGS = {Bangladesh:'🇧🇩',India:'🇮🇳',Pakistan:'🇵🇰',UK:'🇬🇧',USA:'🇺🇸',France:'🇫🇷',Germany:'🇩🇪',Italy:'🇮🇹',Turkey:'🇹🇷',Arabic:'🌍',Russia:'🇷🇺',Global:'🌐'};
const QCATS = ['Sports','News','Natok/Drama','Kids','Religious','Music','Documentary','Education'];

// Pre-calculate filter parameters once database is loaded
function precalculateFilterData() {
  uniqueCats = [...new Set(allCh.map(c => c.subcat))].filter(Boolean).sort();
  uniqueCountries = [...new Set(allCh.map(c => c.country))].filter(Boolean).sort();
}

function buildFilters() {
  const q = (fSearch || '').toLowerCase();
  const baseSrc = allCh.filter(ch => !q || ch.name.toLowerCase().includes(q));

  // Build category select from pre-calculated data
  selCat.innerHTML = '<option value="all">All Categories</option>';
  uniqueCats.forEach(c => {
    const o = document.createElement('option');
    o.value = o.textContent = c;
    if (fCat === c) o.selected = true;
    selCat.appendChild(o);
  });

  // Country pills — only show countries that have channels matching search + selected category
  const activeCounts = {};
  const cSrc = baseSrc.filter(c => fCat === 'all' || c.subcat === fCat);
  for (let i = 0; i < cSrc.length; i++) {
    const country = cSrc[i].country;
    activeCounts[country] = (activeCounts[country] || 0) + 1;
  }

  cpills.innerHTML = '';
  mkPill(cpills, `🌐 All (${cSrc.length})`, fCountry === 'all', () => { fCountry = 'all'; buildFilters(); applyFilters(); });
  
  COUNTRIES.forEach(c => {
    const cnt = activeCounts[c] || 0;
    if (cnt > 0) mkPill(cpills, `${FLAGS[c] || '🌐'} ${c} (${cnt})`, fCountry === c, () => { fCountry = c; buildFilters(); applyFilters(); });
  });

  Object.entries(activeCounts).forEach(([c, cnt]) => {
    if (!COUNTRIES.includes(c) && cnt > 0 && c !== 'Global') {
      mkPill(cpills, `🌐 ${c} (${cnt})`, fCountry === c, () => { fCountry = c; buildFilters(); applyFilters(); });
    }
  });

  // Subcategory pills
  qpills.innerHTML = '';
  const qSrc = baseSrc.filter(c => fCountry === 'all' || c.country === fCountry);
  const subcatCounts = {};
  for (let i = 0; i < qSrc.length; i++) {
    const subcat = qSrc[i].subcat;
    if (subcat) subcatCounts[subcat] = (subcatCounts[subcat] || 0) + 1;
  }

  mkPill(qpills, `All Types (${qSrc.length})`, fCat === 'all', () => { fCat = 'all'; buildFilters(); applyFilters(); });
  
  Object.keys(subcatCounts).sort().forEach(sc => {
    const cnt = subcatCounts[sc];
    if (cnt > 0) mkPill(qpills, `${sc} (${cnt})`, fCat === sc, () => { fCat = sc; buildFilters(); applyFilters(); });
  });
}

function mkPill(parent, label, active, onClick) {
  const b = document.createElement('button');
  b.className = 'pill' + (active ? ' on' : '');
  b.textContent = label;
  b.addEventListener('click', onClick);
  parent.appendChild(b);
}

function applyFilters() {
  const q = fSearch.toLowerCase();
  filtered = allCh.filter(ch => {
    if (q && !ch.name.toLowerCase().includes(q)) return false;
    if (fCat !== 'all' && ch.subcat !== fCat) return false;
    if (fCountry !== 'all' && ch.country !== fCountry) return false;
    return true;
  });

  // Pre-calculate status scores for fast sorting
  filtered.forEach(ch => {
    const st = statusMap[ch._u] || 'unknown';
    ch._score = st === 'active' ? 4 : st === 'isp_bdix' ? 3 : st === 'blocked' ? 2 : st === 'unknown' ? 1 : 0;
  });
  filtered.sort((a, b) => b._score - a._score);

  page = 1;
  statC.textContent = filtered.length;
  statT.textContent  = allCh.length;
  renderGrid();
}

// ══════════════════════════════════════════
//  GRID
// ══════════════════════════════════════════
function renderGrid() {
  grid.innerHTML = '';
  pages.innerHTML = '';
  if (!filtered.length) {
    grid.innerHTML = '<div id="loading" style="min-height:150px;color:var(--muted);font-size:12px;font-weight:600;grid-column:1/-1;display:flex;align-items:center;justify-content:center;">No channels found.</div>';
    return;
  }
  const total = Math.ceil(filtered.length / PER);
  if (page > total) page = total;
  const slice = filtered.slice((page-1)*PER, page*PER);

  const frag = document.createDocumentFragment();
  slice.forEach(ch => frag.appendChild(makeCard(ch)));
  grid.appendChild(frag);
  if (total > 1) renderPages(total);
}

function makeCard(ch) {
  const st = getStatus(ch);
  const card = document.createElement('div');
  card.className = 'card';

  let badge = '';
  if      (st==='active')   badge = '<span class="badge b-live">Live</span>';
  else if (st==='isp_bdix') badge = '<span class="badge b-bdix">BDIX</span>';
  else if (st==='blocked')  badge = '<span class="badge b-geo">Geo</span>';

  card.innerHTML = `
    ${badge}
    <div class="c-img"><img src="${logoSrc(ch.logo, ch.name)}" alt="${ch.name}" loading="lazy" onerror="this.onerror=null; this.src=getFallback('${ch.name.replace(/'/g, "\\'")}')"></div>
    <div class="c-info">
      <div class="c-name">${ch.name}</div>
      <div class="c-sub">${ch.country} · ${ch.group}</div>
    </div>`;
  card.tabIndex = 0;
  card.addEventListener('click', () => openPlayer(ch));
  card.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      openPlayer(ch);
    }
  });
  return card;
}

// ══════════════════════════════════════════
//  PAGINATION
// ══════════════════════════════════════════
function renderPages(total) {
  const p = document.createElement('button');
  p.className='pgb'; p.textContent='◄ Prev'; p.disabled=page===1;
  p.onclick=()=>{ page--; renderGrid(); scrollUp(); };

  const info = document.createElement('span');
  info.className='pgi'; info.textContent=`${page} / ${total}`;

  const n = document.createElement('button');
  n.className='pgb'; n.textContent='Next ►'; n.disabled=page===total;
  n.onclick=()=>{ page++; renderGrid(); scrollUp(); };

  pages.append(p, info, n);
}
function scrollUp() {
  document.getElementById('filters').scrollIntoView({behavior:'smooth',block:'start'});
}

// ══════════════════════════════════════════
//  PLAYER — URL decoded ONLY at play time
// ══════════════════════════════════════════
function openPlayer(ch) {
  activeCh = ch;
  pWrap.classList.add('show');
  pErr.classList.remove('show');
  pWrap.scrollIntoView({behavior:'smooth',block:'start'});

  // Logo
  piLogo.src = logoSrc(ch.logo, ch.name);
  piLogo.onerror = () => { piLogo.onerror=null; piLogo.src = getFallback(ch.name); };

  // Info
  piTitle.textContent   = ch.name;
  piCountry.textContent = ch.country;
  piCat.textContent     = ch.subcat || ch.group;

  renderQueue(ch);
  history.pushState({n:ch.name}, ch.name, `?p=${encodeURIComponent(ch.name)}`);

  const rawUrl = _dec(ch._u);
  playStream(rawUrl, ch);
}

function playStream(rawUrl, ch) {
  pErr.classList.remove('show');

  const isPrivate = isPrivateIp(rawUrl);
  const _tmp = rawUrl;

  function onErr(customMsg) {
    pErr.classList.add('show');
    let newStatus = 'down';
    if (isPrivate) {
      errTxt.innerHTML = 'BDIX stream — open browser settings → Allow insecure content.';
    } else if (typeof customMsg === 'string') {
      errTxt.innerHTML = customMsg;
      if (customMsg.includes('403') || customMsg.includes('Geo-blocked')) newStatus = 'blocked';
    } else {
      errTxt.textContent = 'Stream offline or geo-blocked. Try another channel.';
    }
    
    // Dynamically update status and re-sort grid so dead/geo-blocked streams move to the bottom
    if (statusMap[ch._u] !== newStatus) {
      statusMap[ch._u] = newStatus;
      applyFilters(); 
    }
  }

  if (hlsInst) {
    hlsInst.destroy();
    hlsInst = null;
  }
  
  vidEl.onerror = onErr;

  const qWrap = document.getElementById('quality-wrap');
  const qSel = document.getElementById('sel-quality');
  if (qWrap) qWrap.style.display = 'none';

  const isHls = _tmp.includes('.m3u') || _tmp.includes('.m3u8');

  if (isHls && window.Hls && Hls.isSupported()) {
    hlsInst = new Hls({
      maxBufferLength: 20, // Buffer up to 20 seconds only (plenty for live streams, saves RAM)
      maxMaxBufferLength: 40,
      maxBufferSize: 15 * 1000 * 1000, // Limit buffer size to 15MB RAM to prevent low-end crashes
      liveSyncDurationCount: 3,
      liveMaxLatencyDurationCount: 10,
      enableWorker: true, // Offload processing to Web Worker for low-end CPUs
      lowLatencyMode: false,
      backBufferLength: 10 // Automatically discard watched segments to free memory
    });
    hlsInst.loadSource(_tmp);
    hlsInst.attachMedia(vidEl);
    
    hlsInst.on(Hls.Events.MANIFEST_PARSED, (e, data) => {
      if (qWrap && data.levels && data.levels.length > 0) {
        qWrap.style.display = 'flex';
        qSel.innerHTML = '<option value="-1">Auto Quality</option>';
        data.levels.forEach((lvl, i) => {
          const opt = document.createElement('option');
          opt.value = i;
          opt.textContent = lvl.height ? `${lvl.height}p` : `Quality ${i+1}`;
          qSel.appendChild(opt);
        });
        qSel.onchange = () => {
          hlsInst.currentLevel = parseInt(qSel.value, 10);
        };
      } else if (qWrap) {
        qWrap.style.display = 'flex';
        qSel.innerHTML = '<option value="-1">Default / Auto</option>';
      }
      const playPromise = vidEl.play();
      if (playPromise !== undefined) { playPromise.catch(() => {}); }
    });
    
    let networkRetryCount = 0;
    hlsInst.on(Hls.Events.ERROR, (e, data) => {
      if (data.fatal) {
        switch (data.type) {
          case Hls.ErrorTypes.NETWORK_ERROR:
            const code = (data.response && data.response.code) ? data.response.code : 0;
            if (code === 403) {
              onErr('Access Denied (403) 🔒 Geo-blocked or Token Expired.');
            } else if (code === 404) {
              onErr('Not Found (404) 🚫 Stream link is dead.');
            } else if (data.details === 'manifestLoadError' && code === 0) {
              onErr('CORS Error ❌ Provider blocked access from web browsers.');
            } else if (networkRetryCount < 1) {
              networkRetryCount++;
              hlsInst.startLoad();
            } else {
              onErr(`Network Error (${code || 'Unknown'}) 📡 Stream offline.`);
            }
            break;
          case Hls.ErrorTypes.MEDIA_ERROR:
            hlsInst.recoverMediaError();
            break;
          default:
            onErr();
            break;
        }
      }
    });
  } else {
    vidEl.src = _tmp;
    const playPromise = vidEl.play();
    if (playPromise !== undefined) { playPromise.catch(() => {}); }
  }

  // Anti-Lag Professional Rewind Feature
  let bufferTimer;
  vidEl.onwaiting = () => {
    clearTimeout(bufferTimer);
    bufferTimer = setTimeout(() => {
      if (vidEl.readyState < 3) {
        // Jump back 8 seconds to build up a healthy buffer and prevent repeated lagging
        vidEl.currentTime = Math.max(0, vidEl.currentTime - 8);
        const p = vidEl.play();
        if (p !== undefined) p.catch(() => {});
      }
    }, 4000); // Trigger after 4 seconds of buffering
  };
  vidEl.onplaying = () => {
    clearTimeout(bufferTimer);
  };
}

function closePlayer() {
  activeCh = null;
  vidEl.pause(); 
  vidEl.src = ''; 
  if (hlsInst) {
    hlsInst.destroy();
    hlsInst = null;
  }
  pWrap.classList.remove('show');
  history.pushState(null,'',location.pathname);
}

function renderQueue(active) {
  const sc = s => s==='active'?4:s==='isp_bdix'?3:s==='blocked'?2:s==='unknown'?1:0;
  
  let related = allCh.filter(c => c.group === active.group || c.country === active.country && c._u !== active._u);
  related.sort((a,b) => sc(getStatus(b)) - sc(getStatus(a)));
  related = related.slice(0, 60);
  
  const sorted  = [active, ...related];
  qCnt.textContent = sorted.length;
  qList.innerHTML  = '';
  const frag = document.createDocumentFragment();
  sorted.forEach(ch => {
    const st = getStatus(ch);
    let badge = '';
    if      (st==='active')   badge = '<span class="badge b-live" style="position:static;font-size:7px;padding:1px 3px;margin-right:4px;">Live</span>';
    else if (st==='isp_bdix') badge = '<span class="badge b-bdix" style="position:static;font-size:7px;padding:1px 3px;margin-right:4px;">BDIX</span>';
    else if (st==='blocked')  badge = '<span class="badge b-geo" style="position:static;font-size:7px;padding:1px 3px;margin-right:4px;">Geo</span>';
    
    const d = document.createElement('div');
    d.className = 'qi' + (ch._u === active._u ? ' on' : '');
    d.innerHTML = `
      <img class="qi-thumb" src="${logoSrc(ch.logo, ch.name)}" alt="" loading="lazy" onerror="this.onerror=null; this.src=getFallback('${ch.name.replace(/'/g, "\\'")}')">
      <div class="qi-info">
        <div class="qi-n">${ch.name}</div>
        <div class="qi-s">${badge}${ch.country} · ${ch.subcat || ch.group}</div>
      </div>`;
    d.addEventListener('click', () => openPlayer(ch));
    frag.appendChild(d);
  });
  qList.appendChild(frag);
}

// ══════════════════════════════════════════
//  NAVIGATION & MENU
// ══════════════════════════════════════════
window.goHome = function(e) {
  if (e) e.preventDefault();
  closePlayer();
  fSearch=''; fCat='all'; fCountry='all';
  srchEl.value=''; selCat.value='all';
  document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
  document.getElementById('nav-home')?.classList.add('active');
  buildFilters(); applyFilters();
  window.scrollTo({ top: 0, behavior: 'smooth' });
};

window.filterMenu = function(e, category) {
  if (e) e.preventDefault();
  closePlayer();
  fSearch=''; fCat=category; fCountry='all';
  srchEl.value=''; selCat.value=category;
  document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
  e.currentTarget.classList.add('active');
  buildFilters(); applyFilters();
  window.scrollTo({ top: 0, behavior: 'smooth' });
};

// ══════════════════════════════════════════
//  EVENTS
// ══════════════════════════════════════════
pClose.addEventListener('click', closePlayer);
btnProxy.addEventListener('click', () => {
  if (activeCh) {
    openPlayer(activeCh);
  }
});

btnReport.addEventListener('click', () => {
  if (!activeCh) return;
  // Redirect to Telegram with a pre-filled message (works best if AnonymousOrigin is a bot or user ID)
  const msg = `⚠️ Report: The channel "${activeCh.name}" is not working on BUG TV.`;
  window.open(`https://t.me/AnonymousOrigin?text=${encodeURIComponent(msg)}`, '_blank');
});

srchEl.addEventListener('input', e => {
  clearTimeout(srchTimer);
  srchTimer = setTimeout(()=>{ fSearch=e.target.value; buildFilters(); applyFilters(); }, 280);
});
selCat.addEventListener('change', e => { fCat=e.target.value; buildFilters(); applyFilters(); });
selDb.addEventListener('change', e => { dbKey=e.target.value; loadDb(); });
breset.addEventListener('click', ()=>{ fSearch=''; fCat='all'; fCountry='all'; srchEl.value=''; selCat.value='all'; buildFilters(); applyFilters(); });
window.addEventListener('popstate', e => { if (e.state?.n) { const ch=allCh.find(c=>c.name===e.state.n); if(ch) openPlayer(ch); } else closePlayer(); });

// Keyboard Shortcuts & Android TV Remote Control
window.addEventListener('keydown', e => {
  // Ignore shortcuts if typing in search box
  if (document.activeElement === srchEl) return;

  const isPlayerOpen = pWrap.classList.contains('show');

  if (isPlayerOpen) {
    switch(e.key.toLowerCase()) {
      case 'escape':
      case 'backspace':
        e.preventDefault();
        closePlayer();
        break;
      case ' ':
      case 'enter':
        // Don't intercept Enter if focused on a specific button (like close or proxy)
        if (e.key === 'Enter' && document.activeElement !== document.body && document.activeElement !== vidEl) return;
        e.preventDefault();
        vidEl.paused ? vidEl.play() : vidEl.pause();
        break;
      case 'f':
        e.preventDefault();
        if (!document.fullscreenElement) {
          vidEl.requestFullscreen?.() || vidEl.webkitRequestFullscreen?.();
        } else {
          document.exitFullscreen?.() || document.webkitExitFullscreen?.();
        }
        break;
      case 'm':
        e.preventDefault();
        vidEl.muted = !vidEl.muted;
        break;
      case 'arrowup':
      case 'arrowdown':
        e.preventDefault();
        // TV Remote up/down changes channel in player
        const related = allCh.filter(c => c.group === activeCh?.group || c.country === activeCh?.country).slice(0, 60);
        const sorted = [activeCh, ...related.filter(c => c._u !== activeCh?._u)];
        if (sorted.length > 1) {
          let nextIdx = e.key === 'ArrowDown' ? 1 : sorted.length - 1;
          openPlayer(sorted[nextIdx]);
        }
        break;
    }
  } else {
    // Spatial Navigation for Grid (TV Remote)
    if (['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
      const focusables = Array.from(document.querySelectorAll('.card, .nav-link, .logo, input, select'));
      const active = document.activeElement;
      
      if (!focusables.includes(active)) {
        // If nothing is focused, focus the first card or nav link
        const firstCard = document.querySelector('.card');
        if (firstCard) { e.preventDefault(); firstCard.focus(); }
        return;
      }
      
      // Basic native-like focus moving by grid position
      const rect = active.getBoundingClientRect();
      let bestDist = Infinity;
      let bestEl = null;

      focusables.forEach(el => {
        if (el === active) return;
        const r = el.getBoundingClientRect();
        let dx = 0, dy = 0;
        
        if (e.key === 'ArrowRight' && r.left >= rect.right - 10) { dx = r.left - rect.right; dy = Math.abs(r.top - rect.top); }
        else if (e.key === 'ArrowLeft' && r.right <= rect.left + 10) { dx = rect.left - r.right; dy = Math.abs(r.top - rect.top); }
        else if (e.key === 'ArrowDown' && r.top >= rect.bottom - 10) { dy = r.top - rect.bottom; dx = Math.abs(r.left - rect.left); }
        else if (e.key === 'ArrowUp' && r.bottom <= rect.top + 10) { dy = rect.top - r.bottom; dx = Math.abs(r.left - rect.left); }
        else return; // Not in direction

        // Weight distance (prefer straight lines)
        const dist = Math.sqrt(dx*dx + dy*dy*10); 
        if (dist < bestDist) {
          bestDist = dist;
          bestEl = el;
        }
      });

      if (bestEl) {
        e.preventDefault();
        bestEl.focus();
        bestEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }
});

// ══════════════════════════════════════════
//  BOOT
// ══════════════════════════════════════════
async function loadDb() {
  grid.innerHTML = '<div class="g-msg"><div class="spin"></div><span id="load-prog-msg">Loading channels...</span></div>';
  pages.innerHTML = '';
  statC.textContent = '0'; statT.textContent = '0';
  allCh = await fetchPL(_DB[dbKey]);
  precalculateFilterData(); // pre-calculate unique cats and countries!
  buildFilters();
  applyFilters();
  const p = new URLSearchParams(location.search).get('p');
  if (p && !activeCh) {
    const ch = allCh.find(c=>c.name.toLowerCase()===decodeURIComponent(p).toLowerCase());
    if (ch) openPlayer(ch);
  }
}

async function init() {
  fetchStatus().then(()=>{ if (allCh.length>0) applyFilters(); });
  await loadDb();
}

init();

// Optimize player interactivity (prevent controls flickering/immediate hiding)
let controlsTimeout;

function showPlayerControls() {
  try {
    const shadow = vidPlayer?.shadowRoot || document.getElementById('vid-player')?.shadowRoot;
    const controls = shadow ? shadow.querySelector('.media-controls') : document.querySelector('.media-controls');
    const overlay = shadow ? shadow.querySelector('.media-overlay') : document.querySelector('.media-overlay');
    
    if (controls) {
      controls.setAttribute('data-visible', 'true');
      controls.style.opacity = '1';
      controls.style.pointerEvents = 'auto';
      controls.style.transform = 'scale(1)';
    }
    if (overlay) {
      overlay.style.opacity = '1';
    }
  } catch (e) {}

  clearTimeout(controlsTimeout);
  controlsTimeout = setTimeout(() => {
    try {
      const shadow = vidPlayer?.shadowRoot || document.getElementById('vid-player')?.shadowRoot;
      const controls = shadow ? shadow.querySelector('.media-controls') : document.querySelector('.media-controls');
      const overlay = shadow ? shadow.querySelector('.media-overlay') : document.querySelector('.media-overlay');
      
      // Only hide if the video is playing (if paused, keep controls visible)
      if (controls && !vidEl.paused) {
        controls.removeAttribute('data-visible');
        controls.style.opacity = '';
        controls.style.pointerEvents = '';
        controls.style.transform = '';
      }
      if (overlay && !vidEl.paused) {
        overlay.style.opacity = '';
      }
    } catch (e) {}
  }, 3500); // Hide controls after 3.5 seconds of inactivity
}

if (vidEl) {
  // Listen for mouse/pointer/touch interaction on the player area
  const vboxContainer = document.getElementById('vbox');
  if (vboxContainer) {
    vboxContainer.addEventListener('pointermove', showPlayerControls);
    vboxContainer.addEventListener('pointerdown', showPlayerControls);
    vboxContainer.addEventListener('click', (e) => {
      // If clicked on buttons or selector, don't toggle play/pause
      if (e.target.closest('button, select, #p-close, #btn-proxy, #btn-report')) return;
      
      // Toggle play/pause on player body click
      if (vidEl.paused) {
        vidEl.play().catch(() => {});
      } else {
        vidEl.pause();
      }
      showPlayerControls();
    });
  }
  
  // Keep controls visible if video is paused
  vidEl.addEventListener('pause', showPlayerControls);
  vidEl.addEventListener('play', showPlayerControls);
}

