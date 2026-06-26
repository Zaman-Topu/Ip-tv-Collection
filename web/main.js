import Hls from 'hls.js';

// ── URL helpers ──────────────────────────────────────────────────
const b64 = s => atob(s);
const DB = {
  active:   b64('aHR0cHM6Ly9yYXcuZ2l0aHVidXNlcmNvbnRlbnQuY29tL1phbWFuLVRvcHUvSXAtdHYtQ29sbGVjdGlvbi9tYWluL0ZJTkFMX0lQVFZfQUNUSVZFLm0zdQ=='),
  geo:      b64('aHR0cHM6Ly9yYXcuZ2l0aHVidXNlcmNvbnRlbnQuY29tL1phbWFuLVRvcHUvSXAtdHYtQ29sbGVjdGlvbi9tYWluL0ZJTkFMX0lQVFZfR0VPLm0zdQ=='),
  complete: b64('aHR0cHM6Ly9yYXcuZ2l0aHVidXNlcmNvbnRlbnQuY29tL1phbWFuLVRvcHUvSXAtdHYtQ29sbGVjdGlvbi9tYWluL0ZJTkFMX0lQVFZfQ09NUExFVEUubTN1'),
};
const STATUS_URL = b64('aHR0cHM6Ly9yYXcuZ2l0aHVidXNlcmNvbnRlbnQuY29tL1phbWFuLVRvcHUvSXAtdHYtQ29sbGVjdGlvbi9tYWluL2NoYW5uZWxfc3RhdHVzLmpzb24=');

// ── State ────────────────────────────────────────────────────────
let allChannels = [];
let filtered    = [];
let statusMap   = {};
let page        = 1;
const PER_PAGE  = 96;
let activeCh    = null;
let hlsInstance = null;
let searchTimer = null;
let currentDbKey = 'active';

// Filter state
let fSearch  = '';
let fCat     = 'all';
let fCountry = 'all';

// ── DOM refs ─────────────────────────────────────────────────────
const grid       = document.getElementById('ch-grid');
const pagination = document.getElementById('pagination');
const loadState  = document.getElementById('load-state');
const statsCount = document.getElementById('stats-count');
const statsTotal = document.getElementById('stats-total');
const searchEl   = document.getElementById('search-input');
const selDb      = document.getElementById('sel-db');
const selCat     = document.getElementById('sel-cat');
const countryPills = document.getElementById('country-pills');
const catPills     = document.getElementById('cat-pills');
const btnReset     = document.getElementById('btn-reset');

const playerWrap   = document.getElementById('player-wrap');
const vid          = document.getElementById('vid');
const playerClose  = document.getElementById('player-close');
const playerError  = document.getElementById('player-error');
const errMsg       = document.getElementById('err-msg');
const tryProxyBtn  = document.getElementById('try-proxy-btn');
const piLogo       = document.getElementById('pi-logo');
const piTitle      = document.getElementById('pi-title');
const piMeta       = document.getElementById('pi-meta');
const queueList    = document.getElementById('queue-list');
const queueCount   = document.getElementById('queue-count');

// ── Tiny placeholder SVG (inline, no external request) ──────────
const FALLBACK_IMG = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='80' height='50'%3E%3Crect width='80' height='50' fill='%23111'/%3E%3Ctext x='50%25' y='55%25' dominant-baseline='middle' text-anchor='middle' font-family='sans-serif' font-size='10' fill='%23555'%3ETV%3C/text%3E%3C/svg%3E`;

// ── Country detection (fast lookup map) ─────────────────────────
const COUNTRY_MAP = {
  'bangladesh': 'Bangladesh', 'bdix': 'Bangladesh', 'btv': 'Bangladesh',
  'somoy': 'Bangladesh', 'tsports': 'Bangladesh', 'sports bd': 'Bangladesh',
  'india': 'India', 'star sports': 'India', 'sony': 'India',
  'zee': 'India', 'colors': 'India', 'hindi': 'India',
  'pakistan': 'Pakistan', 'geo': 'Pakistan', 'ten sports': 'Pakistan',
  'uk': 'UK', 'sky sports': 'UK', 'bbc': 'UK',
  'usa': 'USA', 'espn': 'USA', 'fox': 'USA', 'hbo': 'USA',
};
function detectCountry(group, name) {
  const g = (group || '').toLowerCase();
  const n = (name  || '').toLowerCase();
  for (const [key, val] of Object.entries(COUNTRY_MAP)) {
    if (g.includes(key) || n.includes(key)) return val;
  }
  return 'Global';
}

// ── Server detection ─────────────────────────────────────────────
function detectServer(url) {
  try {
    const h = new URL(url).hostname;
    if (h.includes('toffeelive'))  return 'Toffee';
    if (h.includes('bioscopelive')) return 'Bioscope';
    if (h.includes('github'))      return 'GitHub';
    if (h.includes('cloudfront'))  return 'CloudFront';
    const parts = h.replace('www.','').split('.');
    return parts.length > 1 ? parts[parts.length - 2] : h;
  } catch { return 'CDN'; }
}

// ── Private IP check ────────────────────────────────────────────
function isPrivateIp(urlStr) {
  try {
    const h = new URL(urlStr).hostname;
    const p = h.split('.').map(Number);
    if (p.length !== 4) return false;
    return p[0]===10 || p[0]===127 ||
           (p[0]===192 && p[1]===168) ||
           (p[0]===172 && p[1]>=16 && p[1]<=31) ||
           (p[0]===100 && p[1]>=64 && p[1]<=127) ||
           h === 'localhost';
  } catch { return false; }
}

// ── M3U parser (streaming line-by-line, no full DOM build) ───────
function parseM3U(text) {
  const channels = [];
  const lines = text.split('\n');
  let cur = {};
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    if (line.startsWith('#EXTINF:')) {
      const logoM  = line.match(/tvg-logo="([^"]+)"/);
      const groupM = line.match(/group-title="([^"]+)"/);
      const commaI = line.lastIndexOf(',');
      cur = {
        logo:  logoM  ? logoM[1]  : '',
        group: groupM ? groupM[1].trim() : 'Others',
        name:  commaI >= 0 ? line.substring(commaI + 1).trim() : 'Unknown',
      };
      if (!cur.name) cur.name = 'Unknown';
    } else if (line.startsWith('http') || line.startsWith('rtmp') || line.startsWith('rtsp')) {
      if (cur.name && !line.includes('/enc/') && !line.includes('cenc')) {
        cur.url     = line;
        cur.country = detectCountry(cur.group, cur.name);
        cur.server  = detectServer(line);
        channels.push(cur);
      }
      cur = {};
    }
  }
  return channels;
}

// ── Fetch M3U ───────────────────────────────────────────────────
async function fetchPlaylist(url) {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 10000);
    const r = await fetch(url, { signal: ctrl.signal });
    clearTimeout(t);
    return parseM3U(await r.text());
  } catch {
    return [];
  }
}

// ── Status fetch (non-blocking) ──────────────────────────────────
async function fetchStatus() {
  try {
    const r = await fetch(STATUS_URL);
    if (r.ok) statusMap = await r.json();
  } catch { /* ok, optional */ }
}

// ── Filters ──────────────────────────────────────────────────────
const COUNTRIES = ['Bangladesh','India','Pakistan','UK','USA','Global'];
const FLAGS = { Bangladesh:'🇧🇩', India:'🇮🇳', Pakistan:'🇵🇰', UK:'🇬🇧', USA:'🇺🇸', Global:'🌐' };
const QUICK_CATS = ['Sports','News','Bangladesh','India','Kids','Entertainment','Others'];

function buildFilters() {
  // Category select
  const cats = [...new Set(allChannels.map(c => c.group))].sort();
  selCat.innerHTML = '<option value="all">All Categories</option>';
  cats.forEach(c => {
    const o = document.createElement('option');
    o.value = o.textContent = c;
    selCat.appendChild(o);
  });

  // Country pills
  countryPills.innerHTML = '';
  const allBtn = makePill('All Countries', fCountry === 'all', () => { fCountry='all'; buildFilters(); applyFilters(); });
  countryPills.appendChild(allBtn);
  COUNTRIES.forEach(c => {
    const btn = makePill(`${FLAGS[c]||'🌐'} ${c}`, fCountry === c, () => { fCountry=c; buildFilters(); applyFilters(); });
    countryPills.appendChild(btn);
  });

  // Quick cat pills
  catPills.innerHTML = '';
  const allCBtn = makePill('All', fCat === 'all', () => { fCat='all'; selCat.value='all'; buildFilters(); applyFilters(); });
  catPills.appendChild(allCBtn);
  QUICK_CATS.forEach(c => {
    const btn = makePill(c, fCat === c, () => { fCat=c; selCat.value=c; buildFilters(); applyFilters(); });
    catPills.appendChild(btn);
  });
}

function makePill(label, isActive, onClick) {
  const btn = document.createElement('button');
  btn.className = 'pill-btn' + (isActive ? ' active' : '');
  btn.textContent = label;
  btn.addEventListener('click', onClick);
  return btn;
}

function applyFilters() {
  const q = fSearch.toLowerCase();
  filtered = allChannels.filter(ch => {
    if (q && !ch.name.toLowerCase().includes(q)) return false;
    if (fCat !== 'all' && ch.group !== fCat) return false;
    if (fCountry !== 'all' && ch.country !== fCountry) return false;
    return true;
  });

  // Sort: active > bdix > blocked > unknown > down
  const score = s => s==='active'?4 : s==='isp_bdix'?3 : s==='blocked'?2 : s==='unknown'?1 : 0;
  filtered.sort((a,b) => score(statusMap[b.url]||'unknown') - score(statusMap[a.url]||'unknown'));

  page = 1;
  statsCount.textContent = filtered.length;
  statsTotal.textContent  = allChannels.length;
  renderGrid();
}

// ── Grid rendering (DocumentFragment for perf) ──────────────────
function renderGrid() {
  grid.innerHTML = '';
  pagination.innerHTML = '';

  if (filtered.length === 0) {
    grid.innerHTML = '<div id="load-state" style="color:var(--muted);font-size:13px;font-weight:600;padding:40px;text-align:center;grid-column:1/-1;">No channels found.</div>';
    return;
  }

  const totalPages = Math.ceil(filtered.length / PER_PAGE);
  if (page > totalPages) page = totalPages;
  const slice = filtered.slice((page-1)*PER_PAGE, page*PER_PAGE);

  const frag = document.createDocumentFragment();
  slice.forEach(ch => frag.appendChild(makeCard(ch)));
  grid.appendChild(frag);

  if (totalPages > 1) renderPagination(totalPages);
}

function makeCard(ch) {
  const status = statusMap[ch.url] || 'unknown';
  const card = document.createElement('div');
  card.className = 'ch-card';

  let badge = '';
  if      (status === 'active')   badge = '<span class="ch-badge badge-live">Live</span>';
  else if (status === 'isp_bdix') badge = '<span class="ch-badge badge-bdix">BDIX</span>';
  else if (status === 'blocked')  badge = '<span class="ch-badge badge-geo">Geo</span>';
  else if (status === 'down')     badge = '<span class="ch-badge badge-off">Off</span>';

  card.innerHTML = `
    ${badge}
    <div class="ch-logo-wrap">
      <img src="${ch.logo || FALLBACK_IMG}" alt="${ch.name}" loading="lazy" onerror="this.src='${FALLBACK_IMG}'">
    </div>
    <div class="ch-name-wrap">
      <div class="ch-name">${ch.name}</div>
      <div class="ch-sub">${ch.country} · ${ch.group}</div>
    </div>`;

  card.addEventListener('click', () => openPlayer(ch));
  return card;
}

// ── Pagination ───────────────────────────────────────────────────
function renderPagination(total) {
  const prev = document.createElement('button');
  prev.className = 'pg-btn'; prev.textContent = '◄ Prev'; prev.disabled = page===1;
  prev.onclick = () => { page--; renderGrid(); scrollToGrid(); };

  const info = document.createElement('span');
  info.className = 'pg-info'; info.textContent = `${page} / ${total}`;

  const next = document.createElement('button');
  next.className = 'pg-btn'; next.textContent = 'Next ►'; next.disabled = page===total;
  next.onclick = () => { page++; renderGrid(); scrollToGrid(); };

  pagination.append(prev, info, next);
}

function scrollToGrid() {
  document.getElementById('filters-bar').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ── Player ───────────────────────────────────────────────────────
function openPlayer(ch, useProxy = false) {
  activeCh = ch;
  playerWrap.classList.add('show');
  playerError.classList.remove('show');
  playerWrap.scrollIntoView({ behavior: 'smooth', block: 'start' });

  // Info
  piLogo.src = ch.logo || FALLBACK_IMG;
  piLogo.onerror = () => { piLogo.src = FALLBACK_IMG; };
  piTitle.textContent = ch.name;
  piMeta.textContent  = `${ch.country} · ${ch.group} · ${ch.server}`;

  // Queue
  renderQueue(ch);

  // History
  history.pushState({ ch }, ch.name, `?play=${encodeURIComponent(ch.name)}`);

  // Load stream
  loadStream(ch.url, useProxy, ch);
}

function loadStream(rawUrl, useProxy, ch) {
  // Destroy old hls
  if (hlsInstance) { hlsInstance.destroy(); hlsInstance = null; }
  vid.pause();
  vid.removeAttribute('src');
  vid.load();
  playerError.classList.remove('show');

  const isPrivate = isPrivateIp(rawUrl);
  const isHttp    = rawUrl.startsWith('http:');
  const isHttps   = location.protocol === 'https:';

  let url = rawUrl;
  if (useProxy && !isPrivate) {
    url = `https://corsproxy.io/?url=${encodeURIComponent(rawUrl)}`;
  } else if (isHttp && isHttps && !isPrivate) {
    url = `https://corsproxy.io/?url=${encodeURIComponent(rawUrl)}`;
  }

  const isHLS  = url.includes('.m3u8') || url.includes('.m3u');
  const isDASH = url.includes('.mpd');

  function onError() {
    if (!useProxy && !isPrivate) {
      // Retry with proxy once
      loadStream(rawUrl, true, ch);
    } else {
      playerError.classList.add('show');
      if (isPrivate) {
        errMsg.innerHTML = 'BDIX stream: you must be on the host ISP. Click the address bar lock → Site Settings → Allow insecure content.';
      } else if (isHttp && isHttps) {
        errMsg.innerHTML = 'HTTP stream blocked on HTTPS. <br>Lock icon → Site Settings → Insecure content → Allow, then refresh.';
      } else {
        errMsg.innerHTML = 'Stream is offline, geo-blocked, or unavailable.';
      }
    }
  }

  if (isHLS && Hls.isSupported()) {
    hlsInstance = new Hls({
      maxBufferLength: 15,
      maxMaxBufferLength: 30,
      startLevel: -1,       // auto quality
      enableWorker: true,
      lowLatencyMode: true,
    });
    hlsInstance.loadSource(url);
    hlsInstance.attachMedia(vid);
    hlsInstance.on(Hls.Events.MANIFEST_PARSED, () => vid.play().catch(()=>{}));
    hlsInstance.on(Hls.Events.ERROR, (_, data) => { if (data.fatal) onError(); });
  } else if (isHLS && vid.canPlayType('application/vnd.apple.mpegurl')) {
    // Safari native HLS
    vid.src = url;
    vid.play().catch(()=>{});
    vid.onerror = onError;
  } else if (!isHLS && !isDASH) {
    // Direct MP4 / TS etc.
    vid.src = url;
    vid.play().catch(()=>{});
    vid.onerror = onError;
  } else {
    vid.src = url;
    vid.play().catch(()=>{});
    vid.onerror = onError;
  }
}

function closePlayer() {
  activeCh = null;
  if (hlsInstance) { hlsInstance.destroy(); hlsInstance = null; }
  vid.pause(); vid.removeAttribute('src'); vid.load();
  playerWrap.classList.remove('show');
  history.pushState(null, '', location.pathname);
}

function renderQueue(active) {
  const related = allChannels.filter(c => c.group === active.group).slice(0, 50);
  const sorted  = [active, ...related.filter(c => c.url !== active.url)];
  queueCount.textContent = sorted.length;
  queueList.innerHTML = '';
  const frag = document.createDocumentFragment();
  sorted.forEach(ch => {
    const item = document.createElement('div');
    item.className = 'queue-item' + (ch.url === active.url ? ' playing' : '');
    item.innerHTML = `
      <img src="${ch.logo||FALLBACK_IMG}" alt="" loading="lazy" onerror="this.src='${FALLBACK_IMG}'">
      <div class="qi-name">${ch.name}</div>`;
    item.addEventListener('click', () => openPlayer(ch));
    frag.appendChild(item);
  });
  queueList.appendChild(frag);
}

// ── Events ───────────────────────────────────────────────────────
playerClose.addEventListener('click', closePlayer);

tryProxyBtn.addEventListener('click', () => {
  if (activeCh) loadStream(activeCh.url, true, activeCh);
});

searchEl.addEventListener('input', e => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => { fSearch = e.target.value; applyFilters(); }, 250);
});

selCat.addEventListener('change', e => { fCat = e.target.value; buildFilters(); applyFilters(); });

selDb.addEventListener('change', e => {
  currentDbKey = e.target.value;
  loadDb();
});

btnReset.addEventListener('click', () => {
  fSearch=''; fCat='all'; fCountry='all';
  searchEl.value=''; selCat.value='all';
  buildFilters(); applyFilters();
});

window.addEventListener('popstate', e => {
  if (e.state?.ch) openPlayer(e.state.ch);
  else closePlayer();
});

// ── Boot ─────────────────────────────────────────────────────────
async function loadDb() {
  grid.innerHTML = '<div id="load-state" style="grid-column:1/-1;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:200px;gap:12px;color:var(--muted);font-size:13px;font-weight:600;"><div class="spinner"></div><span>Loading channels...</span></div>';
  pagination.innerHTML = '';
  statsCount.textContent = '0'; statsTotal.textContent = '0';

  allChannels = await fetchPlaylist(DB[currentDbKey]);
  buildFilters();
  applyFilters();

  // Check URL param after load
  const param = new URLSearchParams(location.search).get('play');
  if (param && !activeCh) {
    const ch = allChannels.find(c => c.name.toLowerCase() === decodeURIComponent(param).toLowerCase());
    if (ch) openPlayer(ch);
  }
}

async function init() {
  // Start loading status in background (non-blocking)
  fetchStatus().then(() => {
    // Re-render grid once status is loaded if channels are ready
    if (allChannels.length > 0) applyFilters();
  });
  await loadDb();
}

init();
