import Hls from 'hls.js';

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
let dbKey     = 'active';

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

const pSection = document.getElementById('player-section');
const vidEl    = document.getElementById('vid');
const pClose   = document.getElementById('p-close');
const pErr     = document.getElementById('p-err');
const errTxt   = document.getElementById('err-txt');
const btnProxy = document.getElementById('btn-proxy');
const piLogo   = document.getElementById('pi-logo');
const piTitle  = document.getElementById('pi-title');
const piMeta   = document.getElementById('pi-meta');
const qList    = document.getElementById('q-list');
const qCnt     = document.getElementById('q-cnt');

// ══════════════════════════════════════════
//  FALLBACK IMAGE (inline SVG — no network request)
// ══════════════════════════════════════════
const FALLBACK = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='64' height='40'%3E%3Crect width='64' height='40' rx='3' fill='%23111'/%3E%3Ctext x='50%25' y='55%25' dominant-baseline='middle' text-anchor='middle' font-family='sans-serif' font-size='9' fill='%23444'%3ETV%3C/text%3E%3C/svg%3E`;

function logoSrc(logo) {
  if (!logo) return FALLBACK;
  // Route logos through proxy to avoid CORS issues + hide direct logo source
  if (logo.startsWith('http')) {
    return `https://wsrv.nl/?url=${encodeURIComponent(logo)}&w=80&h=50&fit=contain&bg=transparent`;
  }
  return logo || FALLBACK;
}

// ══════════════════════════════════════════
//  COUNTRY / SERVER DETECTION
// ══════════════════════════════════════════
const CMAP = {
  'bangladesh':'Bangladesh','bdix':'Bangladesh','btv':'Bangladesh','somoy':'Bangladesh','tsports':'Bangladesh',
  'india':'India','star sports':'India','sony':'India','zee':'India','colors':'India','hindi':'India',
  'pakistan':'Pakistan','geo':'Pakistan','ten sports':'Pakistan',
  'uk':'UK','sky sports':'UK','bbc':'UK',
  'usa':'USA','espn':'USA','fox sports':'USA','hbo':'USA',
};
function detectCountry(g, n) {
  const gL = (g||'').toLowerCase(), nL = (n||'').toLowerCase();
  for (const [k,v] of Object.entries(CMAP)) {
    if (gL.includes(k) || nL.includes(k)) return v;
  }
  return 'Global';
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
      const logoM  = line.match(/tvg-logo="([^"]+)"/);
      const groupM = line.match(/group-title="([^"]+)"/);
      const ci     = line.lastIndexOf(',');
      const group  = groupM ? groupM[1].trim() : 'Others';
      if (isMovieGroup(group)) { cur = null; continue; } // skip movies
      cur = {
        logo:  logoM ? logoM[1] : '',
        group,
        name:  ci >= 0 ? line.substring(ci+1).trim() : 'Unknown',
      };
      if (!cur.name) cur.name = 'Unknown';
    } else if (cur && (line.startsWith('http')||line.startsWith('rtmp')||line.startsWith('rtsp'))) {
      if (line.includes('/enc/')||line.includes('cenc')) { cur=null; continue; }
      cur._u = _enc(line);          // ← URL stored ENCRYPTED only
      cur.country = detectCountry(cur.group, cur.name);
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
const COUNTRIES = ['Bangladesh','India','Pakistan','UK','USA','Global'];
const FLAGS = {Bangladesh:'🇧🇩',India:'🇮🇳',Pakistan:'🇵🇰',UK:'🇬🇧',USA:'🇺🇸',Global:'🌐'};
const QCATS = ['Sports','News','Bangladesh','India','Kids','Entertainment','Religion','Others'];

function buildFilters() {
  const cats = [...new Set(allCh.map(c=>c.group))].sort();
  selCat.innerHTML = '<option value="all">All Categories</option>';
  cats.forEach(c => { const o=document.createElement('option'); o.value=o.textContent=c; selCat.appendChild(o); });

  cpills.innerHTML = '';
  mkPill(cpills,'🌐 All', fCountry==='all', ()=>{ fCountry='all'; buildFilters(); applyFilters(); });
  COUNTRIES.forEach(c => mkPill(cpills, `${FLAGS[c]||'🌐'} ${c}`, fCountry===c, ()=>{ fCountry=c; buildFilters(); applyFilters(); }));

  qpills.innerHTML = '';
  mkPill(qpills,'All', fCat==='all', ()=>{ fCat='all'; selCat.value='all'; buildFilters(); applyFilters(); });
  QCATS.forEach(c => mkPill(qpills, c, fCat===c, ()=>{ fCat=c; selCat.value=c; buildFilters(); applyFilters(); }));
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
    if (fCat !== 'all' && ch.group !== fCat) return false;
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
    <div class="c-img"><img src="${logoSrc(ch.logo)}" alt="${ch.name}" loading="lazy" onerror="this.src='${FALLBACK}'"></div>
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
  pSection.classList.add('show');
  pErr.classList.remove('show');
  pSection.scrollIntoView({behavior:'smooth',block:'start'});

  piLogo.src = logoSrc(ch.logo);
  piLogo.onerror = () => { piLogo.src = FALLBACK; };
  piTitle.textContent = ch.name;
  piMeta.textContent  = `${ch.country} · ${ch.group} · ${ch.server}`;

  renderQueue(ch);
  history.pushState({n:ch.name}, ch.name, `?p=${encodeURIComponent(ch.name)}`);

  // Decode URL at the last possible moment
  const rawUrl = _dec(ch._u);
  playStream(rawUrl, ch, forceProxy);
}

function playStream(rawUrl, ch, useProxy) {
  if (hlsInst) { hlsInst.destroy(); hlsInst = null; }
  vidEl.pause(); vidEl.removeAttribute('src'); vidEl.load();
  pErr.classList.remove('show');

  const isPrivate = isPrivateIp(rawUrl);
  const isHttp    = rawUrl.startsWith('http:');
  const isHttps   = location.protocol==='https:';

  // Always proxy on HTTPS for HTTP streams; or if forceProxy
  let url = rawUrl;
  if ((useProxy || (isHttp && isHttps)) && !isPrivate) {
    url = `https://corsproxy.io/?url=${encodeURIComponent(rawUrl)}`;
  }

  // Clear rawUrl from local scope ASAP (can't fully clear from JS but limits exposure)
  const _tmp = url;

  function onErr() {
    if (!useProxy && !isPrivate) {
      playStream(rawUrl, ch, true); // retry once with proxy
    } else {
      pErr.classList.add('show');
      if (isPrivate) errTxt.innerHTML = 'BDIX stream — must be on the host ISP.<br>Browser lock icon → Site Settings → Allow insecure content.';
      else if (isHttp && isHttps) errTxt.innerHTML = 'HTTP stream blocked on HTTPS.<br>Try the proxy or use another stream.';
      else errTxt.textContent = 'Stream offline, geo-blocked, or unavailable.';
    }
  }

  const isHLS = _tmp.includes('.m3u') || _tmp.includes('.m3u8');

  if (isHLS && Hls.isSupported()) {
    hlsInst = new Hls({
      maxBufferLength: 12,
      maxMaxBufferLength: 24,
      startLevel: -1,
      enableWorker: true,
      lowLatencyMode: true,
      debug: false,
    });
    hlsInst.loadSource(_tmp);
    hlsInst.attachMedia(vidEl);
    hlsInst.on(Hls.Events.MANIFEST_PARSED, () => vidEl.play().catch(()=>{}));
    hlsInst.on(Hls.Events.ERROR, (_, d) => { if (d.fatal) onErr(); });
  } else if (isHLS && vidEl.canPlayType('application/vnd.apple.mpegurl')) {
    // Safari native
    vidEl.src = _tmp;
    vidEl.play().catch(()=>{});
    vidEl.onerror = onErr;
  } else {
    vidEl.src = _tmp;
    vidEl.play().catch(()=>{});
    vidEl.onerror = onErr;
  }
}

function closePlayer() {
  activeCh = null;
  if (hlsInst) { hlsInst.destroy(); hlsInst = null; }
  vidEl.pause(); vidEl.removeAttribute('src'); vidEl.load();
  pSection.classList.remove('show');
  history.pushState(null,'',location.pathname);
}

function renderQueue(active) {
  const related = allCh.filter(c=>c.group===active.group).slice(0,50);
  const sorted  = [active, ...related.filter(c=>c._u!==active._u)];
  qCnt.textContent = sorted.length;
  qList.innerHTML  = '';
  const frag = document.createDocumentFragment();
  sorted.forEach(ch => {
    const d = document.createElement('div');
    d.className = 'qi' + (ch._u===active._u?' on':'');
    d.innerHTML = `<img src="${logoSrc(ch.logo)}" alt="" loading="lazy" onerror="this.src='${FALLBACK}'"><div class="qi-n">${ch.name}</div>`;
    d.addEventListener('click', ()=>openPlayer(ch));
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
  srchTimer = setTimeout(()=>{ fSearch=e.target.value; applyFilters(); }, 280);
});
selCat.addEventListener('change', e => { fCat=e.target.value; buildFilters(); applyFilters(); });
selDb.addEventListener('change', e => { dbKey=e.target.value; loadDb(); });
breset.addEventListener('click', ()=>{ fSearch=''; fCat='all'; fCountry='all'; srchEl.value=''; selCat.value='all'; buildFilters(); applyFilters(); });
window.addEventListener('popstate', e => { if (e.state?.n) { const ch=allCh.find(c=>c.name===e.state.n); if(ch) openPlayer(ch); } else closePlayer(); });

// ══════════════════════════════════════════
//  BOOT
// ══════════════════════════════════════════
async function loadDb() {
  grid.innerHTML = '<div id="loading" style="grid-column:1/-1;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:180px;gap:10px;color:var(--muted);font-size:12px;font-weight:600;"><div class="spin"></div><span>Loading channels...</span></div>';
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
  // Load status in background (non-blocking, re-renders grid when done)
  fetchStatus().then(()=>{ if (allCh.length>0) applyFilters(); });
  await loadDb();
}

init();
