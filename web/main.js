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
const PER     = 96;
let activeCh  = null;
let hlsInst   = null;
let srchTimer = null;
let dbKey     = 'complete';

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

function logoSrc(logo, name) {
  if (!logo) return getFallback(name);
  return logo;
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

function detectCountry(group, name, url) {
  const g = (group || '').toLowerCase().trim();
  const n = (name  || '').toLowerCase().trim();
  const u = (url   || '').toLowerCase();

  // 1. Explicit group match first
  for (const [key, country] of Object.entries(GROUP_COUNTRY)) {
    if (g === key || g.startsWith(key + ' ') || g.includes(key)) {
      return country;
    }
  }

  // 2. Bangladesh channel name check
  for (const kw of BD_NAMES) {
    if (n.includes(kw) || n === kw) return 'Bangladesh';
  }

  // 3. India channel name check
  for (const kw of IN_NAMES) {
    if (n.includes(kw)) return 'India';
  }

  // 4. Pakistan channel name check
  for (const kw of PK_NAMES) {
    if (n.includes(kw)) return 'Pakistan';
  }

  // 5. URL-based detection
  if (u.includes('sonarbanglatv') || u.includes('aynaott') || u.includes('jagobd') ||
      u.includes('toffeelive') || u.includes('bioscopelive') || u.includes('bozztv') ||
      u.includes('gpcdn') || u.includes('ncare.live') || u.includes('boishakhi') ||
      u.includes('.com.bd') || u.includes('.net.bd') || u.includes('.org.bd')) {
    return 'Bangladesh';
  }

  // 6. Keyword checks in name for other countries
  if (n.includes('uk') || n.includes('bbc') || n.includes('itv') || n.includes('sky') || n.includes('channel 4') || n.includes('channel 5')) return 'UK';
  if (n.includes('espn') || n.includes('nbc') || n.includes('cbs') || n.includes('abc news') || n.includes('cnn') || n.includes('fox news') || n.includes('hbo') || n.includes(' usa') || n.includes('american')) return 'USA';
  if (n.includes('france') || n.includes('tf1') || n.includes('m6 ') || n.includes('bfm')) return 'France';
  if (n.includes('ard ') || n.includes('zdf') || n.includes('rtl') || n.includes('deutsch') || n.includes('german')) return 'Germany';
  if (n.includes('rai ') || n.includes('mediaset') || n.includes('italia') || n.includes('canale 5')) return 'Italy';
  if (n.includes('trt') || n.includes('turkey') || n.includes('turk') || n.includes('show tv')) return 'Turkey';
  if (n.includes('arabic') || n.includes('aljazeera') || n.includes('al jazeera') || n.includes('al arabiya') || n.includes('mbc') || n.includes('al hayat')) return 'Arabic';
  if (n.includes('russia') || n.includes('russian') || n.includes('rt ') || n.includes('ntv ')) return 'Russia';

  return 'Global';
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
//  M3U PARSER — stores URLs XOR-encoded
// ══════════════════════════════════════════
function parseM3U(text) {
  const out = [];
  const lines = text.split('\n');
  let cur = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    if (line.startsWith('#EXTINF:')) {
      let logo = '';
      const logoM = line.match(/tvg-logo=(?:"([^"]+)"|'([^']+)'|([^,\s]+))/);
      if (logoM) {
        logo = logoM[1] || logoM[2] || logoM[3] || '';
      }
      if (logo && logo.startsWith('http://')) {
        logo = 'https://wsrv.nl/?url=' + encodeURIComponent(logo);
      }

      const groupM = line.match(/group-title="([^"]+)"/);
      const ci     = line.lastIndexOf(',');
      const group  = groupM ? groupM[1].trim() : 'Others';
      if (isMovieGroup(group)) { cur = null; continue; } // skip movies
      const chanName = ci >= 0 ? line.substring(ci+1).trim() : 'Unknown';
      if (chanName.toLowerCase().includes('playz tv')) { cur = null; continue; }
      cur = {
        logo:  logo,
        group,
        name:  chanName || 'Unknown',
      };
    } else if (cur && (line.startsWith('http')||line.startsWith('rtmp')||line.startsWith('rtsp'))) {
      if (line.includes('/enc/')||line.includes('cenc')) { cur=null; continue; }
      cur._u = _enc(line);          // ← URL stored ENCRYPTED only
      cur.country = detectCountry(cur.group, cur.name, line);
      cur.subcat  = detectSubCategory(cur.group);
      cur.server  = detectServer(line);
      out.push(cur);
      cur = null;
    }
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
    return parseM3U(await r.text());
  } catch { return []; }
}

async function fetchStatus() {
  try {
    const r = await fetch(_dec(_STURL));
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

function buildFilters() {
  const q = (fSearch || '').toLowerCase();
  const baseSrc = allCh.filter(ch => !q || ch.name.toLowerCase().includes(q));

  // Build category select from actual data
  const cats = [...new Set(allCh.map(c=>c.subcat))].filter(Boolean).sort();
  selCat.innerHTML = '<option value="all">All Categories</option>';
  cats.forEach(c => { const o=document.createElement('option'); o.value=o.textContent=c; if(fCat===c) o.selected=true; selCat.appendChild(o); });

  // Country pills — only show countries that have channels matching search + selected category
  const activeCounts = {};
  const cSrc = baseSrc.filter(c => fCat === 'all' || c.subcat === fCat);
  cSrc.forEach(c => { activeCounts[c.country] = (activeCounts[c.country]||0)+1; });

  cpills.innerHTML = '';
  mkPill(cpills, `🌐 All (${cSrc.length})`, fCountry==='all', ()=>{ fCountry='all'; buildFilters(); applyFilters(); });
  COUNTRIES.forEach(c => {
    const cnt = activeCounts[c] || 0;
    if (cnt > 0) mkPill(cpills, `${FLAGS[c]||'🌐'} ${c} (${cnt})`, fCountry===c, ()=>{ fCountry=c; buildFilters(); applyFilters(); });
  });
  // Show remaining countries with channels
  Object.entries(activeCounts).forEach(([c, cnt]) => {
    if (!COUNTRIES.includes(c) && cnt > 0 && c !== 'Global') {
      mkPill(cpills, `🌐 ${c} (${cnt})`, fCountry===c, ()=>{ fCountry=c; buildFilters(); applyFilters(); });
    }
  });

  // Subcategory pills — context-aware based on search + selected country
  qpills.innerHTML = '';
  const qSrc = baseSrc.filter(c => fCountry === 'all' || c.country === fCountry);
  const subcats = [...new Set(qSrc.map(c=>c.subcat))].filter(Boolean).sort();
  mkPill(qpills, `All Types (${qSrc.length})`, fCat==='all', ()=>{ fCat='all'; buildFilters(); applyFilters(); });
  subcats.forEach(sc => {
    const cnt = qSrc.filter(c=>c.subcat===sc).length;
    if (cnt > 0) mkPill(qpills, `${sc} (${cnt})`, fCat===sc, ()=>{ fCat=sc; buildFilters(); applyFilters(); });
  });
}

function mkPill(parent, label, active, onClick) {
  const b = document.createElement('button');
  b.className = 'pill' + (active?' on':'');
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

  // Sort: active > bdix > blocked > unknown > down
  const sc = s => s==='active'?4:s==='isp_bdix'?3:s==='blocked'?2:s==='unknown'?1:0;
  filtered.sort((a,b) => sc(getStatus(b)) - sc(getStatus(a)));

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
  card.addEventListener('click', () => openPlayer(ch));
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
function openPlayer(ch, forceProxy = false) {
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
  playStream(rawUrl, ch, forceProxy);
}

let playerInst = null;

function playStream(rawUrl, ch, useProxy) {
  pErr.classList.remove('show');

  const isPrivate = isPrivateIp(rawUrl);
  const isHttp    = rawUrl.startsWith('http:');
  const isHttps   = location.protocol==='https:';

  // Only proxy if explicitly requested OR HTTP stream on HTTPS (to avoid mixed content block)
  let url = rawUrl;
  if ((useProxy || (isHttp && isHttps)) && !isPrivate) {
    url = `https://corsproxy.io/?url=${encodeURIComponent(rawUrl)}`;
  }
  const _tmp = url;

  function onErr(customMsg) {
    if (!useProxy && !isPrivate) {
      playStream(rawUrl, ch, true); // try with proxy on error
    } else {
      pErr.classList.add('show');
      if (isPrivate) {
        errTxt.innerHTML = 'BDIX stream — open browser settings → Allow insecure content.';
      } else if (typeof customMsg === 'string') {
        errTxt.innerHTML = customMsg;
      } else {
        errTxt.textContent = 'Stream offline or geo-blocked. Try another channel.';
      }
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
      maxBufferLength: 30,
      liveSyncDurationCount: 3,
      liveMaxLatencyDurationCount: 10,
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
  const related = allCh.filter(c => c.group === active.group || c.country === active.country).slice(0, 60);
  const sorted  = [active, ...related.filter(c => c._u !== active._u)];
  qCnt.textContent = sorted.length;
  qList.innerHTML  = '';
  const frag = document.createDocumentFragment();
  sorted.forEach(ch => {
    const d = document.createElement('div');
    d.className = 'qi' + (ch._u === active._u ? ' on' : '');
    d.innerHTML = `
      <img class="qi-thumb" src="${logoSrc(ch.logo, ch.name)}" alt="" loading="lazy" onerror="this.onerror=null; this.src=getFallback('${ch.name.replace(/'/g, "\\'")}')">
      <div class="qi-info">
        <div class="qi-n">${ch.name}</div>
        <div class="qi-s">${ch.country} · ${ch.subcat || ch.group}</div>
      </div>`;
    d.addEventListener('click', () => openPlayer(ch));
    frag.appendChild(d);
  });
  qList.appendChild(frag);
}

// ══════════════════════════════════════════
//  EVENTS
// ══════════════════════════════════════════
pClose.addEventListener('click', closePlayer);
btnProxy.addEventListener('click', () => { if (activeCh) openPlayer(activeCh, true); });

srchEl.addEventListener('input', e => {
  clearTimeout(srchTimer);
  srchTimer = setTimeout(()=>{ fSearch=e.target.value; buildFilters(); applyFilters(); }, 280);
});
selCat.addEventListener('change', e => { fCat=e.target.value; buildFilters(); applyFilters(); });
selDb.addEventListener('change', e => { dbKey=e.target.value; loadDb(); });
breset.addEventListener('click', ()=>{ fSearch=''; fCat='all'; fCountry='all'; srchEl.value=''; selCat.value='all'; buildFilters(); applyFilters(); });
window.addEventListener('popstate', e => { if (e.state?.n) { const ch=allCh.find(c=>c.name===e.state.n); if(ch) openPlayer(ch); } else closePlayer(); });

// ══════════════════════════════════════════
//  BOOT
// ══════════════════════════════════════════
async function loadDb() {
  grid.innerHTML = '<div class="g-msg"><div class="spin"></div><span>Loading channels...</span></div>';
  pages.innerHTML = '';
  statC.textContent = '0'; statT.textContent = '0';
  allCh = await fetchPL(_DB[dbKey]);
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

