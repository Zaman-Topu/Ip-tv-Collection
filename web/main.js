import './style.css';
import videojs from 'video.js';
import 'video.js/dist/video-js.css';
import 'videojs-contrib-dash';

// Security helper to prevent right click and inspect shortcuts
function securePage() {
  document.addEventListener('contextmenu', e => e.preventDefault());
  document.addEventListener('keydown', e => {
    if (e.key === 'F12') {
      e.preventDefault();
      return false;
    }
    if (e.ctrlKey && e.shiftKey && (e.key === 'I' || e.key === 'J' || e.key === 'C' || e.key === 'i' || e.key === 'j' || e.key === 'c')) {
      e.preventDefault();
      return false;
    }
    if (e.ctrlKey && (e.key === 'U' || e.key === 'u' || e.key === 'S' || e.key === 's')) {
      e.preventDefault();
      return false;
    }
  });
}
securePage();

const decodeUrl = (str) => atob(str);

const M3U_URL_LIVE = decodeUrl("aHR0cHM6Ly9yYXcuZ2l0aHVidXNlcmNvbnRlbnQuY29tL1phbWFuLVRvcHUvSXAtdHYtQ29sbGVjdGlvbi9tYWluL0ZJTkFMX0lQVFZfQ09NUExFVEUubTN1");

// Extra IPTV sources
const EXTRA_LIVE_SOURCES = [];

let playerInstance = null;
let errorTimeout = null;
const videoContainer = document.getElementById('video-container');
const playerContainer = document.getElementById('player-container');
const queueList = document.getElementById('player-queue-list');
const queueCountEl = document.getElementById('queue-count');
const closePlayerBtn = document.getElementById('close-player');

// Player Details Elements
const playerDetailsLogo = document.getElementById('player-details-logo');
const playerDetailsTitle = document.getElementById('player-details-title');
const playerDetailsCountry = document.getElementById('player-details-country');
const playerDetailsServer = document.getElementById('player-details-server');
const errorOverlay = document.getElementById('player-error');

window.useCorsProxy = false;

if (videojs.Vhs) {
  videojs.Vhs.xhr.beforeRequest = function(options) {
    if (window.useCorsProxy && options.uri && !options.uri.startsWith('https://corsproxy.io/?url=')) {
      options.uri = `https://corsproxy.io/?url=${encodeURIComponent(options.uri)}`;
    }
    return options;
  };
}

// Filter UI Elements
const searchInput = document.getElementById('search-input');
const filterCategory = document.getElementById('filter-category');
const filterServer = document.getElementById('filter-server');
const filterCountriesList = document.getElementById('filter-countries-list');
const filterQuickCategories = document.getElementById('filter-quick-categories');
const filterResetBtn = document.getElementById('filter-reset');
const clearCountryFilterBtn = document.getElementById('clear-country-filter');

// Main Grid Container and Stats
const container = document.getElementById('category-container');
const feedCountEl = document.getElementById('stats-feed-count');

// State
let allTvChannels = [];
let currentFilteredChannels = [];
let channelStatusMap = {};
let activePlayingChannel = null;

// Filter State
let selectedCategory = 'all';
let selectedCountry = 'all';
let selectedServer = 'all';
let searchQuery = '';

// Pagination State
let currentPage = 1;
const itemsPerPage = 96;
const paginationContainer = document.getElementById('pagination-container');

// Detect Country from channel M3U data
function detectCountry(group, name) {
  const g = (group || '').toLowerCase();
  const n = (name || '').toLowerCase();
  if (g.includes('bangladesh') || g.includes('bdix') || n.includes('bd') || n.includes('btv') || n.includes('somoy') || n.includes('sports bd') || n.includes('tsports')) return 'Bangladesh';
  if (g.includes('india') || n.includes('star sports') || n.includes('sony') || n.includes('zee') || n.includes('colors')) return 'India';
  if (g.includes('pakistan') || n.includes('ten sports') || n.includes('geo')) return 'Pakistan';
  if (g.includes('uk') || g.includes('united kingdom') || n.includes('sky sports') || n.includes('bbc')) return 'United Kingdom';
  if (g.includes('usa') || g.includes('us') || n.includes('espn') || n.includes('fox') || n.includes('hbo')) return 'USA';
  return 'Global';
}

// Detect Server Hub name from URL
function detectServer(url) {
  try {
    const host = new URL(url).hostname;
    if (host.includes('toffeelive')) return 'Toffee';
    if (host.includes('bioscopelive')) return 'Bioscope';
    if (host.includes('github')) return 'GitHub Raw';
    if (host.includes('aiv-cdn')) return 'AIV CDN';
    if (host.includes('cloudfront')) return 'CloudFront';
    return host.replace('www.', '');
  } catch (e) {
    return 'Server Hub';
  }
}

// Check if a URL is hosted on a private local network IP (BDIX)
function isPrivateIp(urlStr) {
  try {
    const url = new URL(urlStr);
    const hostname = url.hostname;
    const parts = hostname.split('.');
    if (parts.length === 4) {
      const o1 = parseInt(parts[0], 10);
      const o2 = parseInt(parts[1], 10);
      if (o1 === 10) return true;
      if (o1 === 127) return true;
      if (o1 === 192 && o2 === 168) return true;
      if (o1 === 172 && (o2 >= 16 && o2 <= 31)) return true;
      if (o1 === 100 && (o2 >= 64 && o2 <= 127)) return true;
      if (o1 === 169 && o2 === 254) return true;
    }
    if (hostname === 'localhost') return true;
    return false;
  } catch (e) {
    return false;
  }
}

// Display error messages inside the video player
function showPlayerError(streamUrl) {
  if (playerInstance) {
    playerInstance.loadingSpinner.hide();
  }
  errorOverlay.classList.remove('hidden');
  
  const titleEl = errorOverlay.querySelector('h3');
  const descEl = errorOverlay.querySelector('p');
  if (titleEl && descEl) {
    const isPrivate = isPrivateIp(streamUrl);
    const isHttp = (streamUrl || '').startsWith('http:');
    
    if (isPrivate) {
      titleEl.innerText = "BDIX / Private ISP Stream";
      descEl.innerHTML = `
        This stream is hosted on a private local IP (BDIX). To play it:<br>
        <span class="text-text-tertiary font-bold">1. You must be on the host ISP network.</span><br>
        <span class="text-text-tertiary font-bold">2. Click the lock/tune icon in the address bar &rarr; Site Settings &rarr; set "Insecure content" to "Allow", then refresh.</span>
      `;
    } else if (isHttp && window.location.protocol === 'https:') {
      titleEl.innerText = "Mixed Content Blocked";
      descEl.innerHTML = `
        This stream uses HTTP, which is blocked on secure HTTPS sites by default. To play:<br>
        <span class="text-text-tertiary font-bold">Click the lock/tune icon in the address bar &rarr; Site Settings &rarr; set "Insecure content" to "Allow", then refresh the page.</span>
      `;
    } else {
      titleEl.innerText = "Stream Offline";
      descEl.innerText = "This stream is currently offline, geo-blocked, or unavailable.";
    }
  }
}

// Map countries to flags
const countryFlags = {
  'Bangladesh': '🇧🇩',
  'India': '🇮🇳',
  'Pakistan': '🇵🇰',
  'United Kingdom': '🇬🇧',
  'USA': '🇺🇸',
  'Global': '🌐'
};

// Parse M3U
async function loadPlaylist(url) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);
  try {
    const cacheBuster = url.includes('?') ? `&t=${Date.now()}` : `?t=${Date.now()}`;
    const response = await fetch(url + cacheBuster, { signal: controller.signal });
    const text = await response.text();
    clearTimeout(timeoutId);
    return parseM3U(text);
  } catch (error) {
    clearTimeout(timeoutId);
    console.warn(`Skipped source (timeout/error): ${url}`);
    return [];
  }
}

function parseM3U(content) {
  const lines = content.split('\n');
  const channels = [];
  let currentChannel = {};

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith('#EXTINF:')) {
      const logoMatch = line.match(/tvg-logo="([^"]+)"/);
      currentChannel.logo = logoMatch ? logoMatch[1] : '';
      
      const groupMatch = line.match(/group-title="([^"]+)"/);
      let group = groupMatch ? groupMatch[1].trim() : 'Others';
      
      // Categorize cleanly
      if (group === 'International News') group = 'News';
      else if (group === 'Music') group = 'Song';
      else if (group === 'Cartoon & Kids') group = 'Kids';
      else if (group === 'Natok & Drama' || group === 'English' || group === 'India') group = 'Entertainment';
      currentChannel.group = group;

      const commaIdx = line.lastIndexOf(',');
      currentChannel.name = commaIdx >= 0 ? line.substring(commaIdx + 1).trim() : 'Unknown Channel';
      if (!currentChannel.name) currentChannel.name = 'Unknown Channel';
    } else if (line.startsWith('http') || line.startsWith('rtmp') || line.startsWith('rtsp')) {
      const url = line.trim();
      currentChannel.url = url;
      currentChannel.country = detectCountry(currentChannel.group, currentChannel.name);
      currentChannel.server = detectServer(url);

      const isDRM = url.includes('cenc') || url.includes('/enc/');
      if (currentChannel.name && currentChannel.url && !isDRM) {
        channels.push({ ...currentChannel });
      }
      currentChannel = {};
    }
  }
  return channels;
}

// Populate Filters (Categories, Servers, Countries)
function populateFilters() {
  // 1. Categories
  const categories = new Set(allTvChannels.map(c => c.group));
  filterCategory.innerHTML = '<option value="all">ALL CATEGORIES</option>';
  categories.forEach(cat => {
    const opt = document.createElement('option');
    opt.value = cat;
    opt.innerText = cat.toUpperCase();
    filterCategory.appendChild(opt);
  });

  // 2. Servers
  const servers = new Set(allTvChannels.map(c => c.server));
  filterServer.innerHTML = '<option value="all">ALL SERVER HUBS</option>';
  servers.forEach(serv => {
    const opt = document.createElement('option');
    opt.value = serv;
    opt.innerText = serv.toUpperCase();
    filterServer.appendChild(opt);
  });

  // 3. Country Pills
  renderCountryPills();

  // 4. Quick Categories
  renderQuickCategoryPills();
}

function renderCountryPills() {
  filterCountriesList.innerHTML = '';
  const countries = ['all', 'Bangladesh', 'India', 'Pakistan', 'United Kingdom', 'USA', 'Global'];
  
  countries.forEach(country => {
    const btn = document.createElement('button');
    const flag = countryFlags[country] || '🌐';
    const label = country === 'all' ? 'All Countries' : country;
    
    btn.className = `filter-pill ${selectedCountry === country ? 'active' : ''}`;
    btn.innerHTML = `<span>${flag}</span> ${label}`;
    btn.onclick = () => {
      selectedCountry = country;
      if (selectedCountry === 'all') {
        clearCountryFilterBtn.classList.add('hidden');
      } else {
        clearCountryFilterBtn.classList.remove('hidden');
      }
      renderCountryPills();
      applyFilters();
    };
    filterCountriesList.appendChild(btn);
  });
}

function renderQuickCategoryPills() {
  filterQuickCategories.innerHTML = '';
  
  // Base categories
  const categories = ['all', 'Sports', 'News', 'Bangladesh', 'Entertainment', 'Kids', 'Song', 'Others'];
  
  categories.forEach(cat => {
    const btn = document.createElement('button');
    const label = cat === 'all' ? 'ALL' : cat;
    
    btn.className = `filter-pill ${selectedCategory === cat ? 'active' : ''}`;
    btn.innerText = label;
    btn.onclick = () => {
      selectedCategory = cat;
      filterCategory.value = cat;
      renderQuickCategoryPills();
      applyFilters();
    };
    filterQuickCategories.appendChild(btn);
  });
}

// Main Filtering Logic
function applyFilters() {
  currentFilteredChannels = allTvChannels.filter(ch => {
    const matchSearch = ch.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchCategory = selectedCategory === 'all' || ch.group === selectedCategory;
    const matchCountry = selectedCountry === 'all' || ch.country === selectedCountry;
    const matchServer = selectedServer === 'all' || ch.server === selectedServer;
    return matchSearch && matchCategory && matchCountry && matchServer;
  });

  // Sort currentFilteredChannels globally so active/BDIX channels are always on page 1!
  currentFilteredChannels.sort((a, b) => {
    const statusA = channelStatusMap[a.url] || 'unknown';
    const statusB = channelStatusMap[b.url] || 'unknown';
    
    const getScore = (status) => {
      if (status === 'active' || status === 'isp_bdix') return 3;
      if (status === 'blocked') return 2;
      if (status === 'unknown') return 1;
      if (status === 'down') return 0;
      return 1;
    };
    
    return getScore(statusB) - getScore(statusA);
  });

  // Reset page to 1
  currentPage = 1;

  // Update Stats Count
  feedCountEl.innerText = `${currentFilteredChannels.length} OF ${allTvChannels.length}`;

  renderGrid();
  
  // Update Queue list if Player is active
  if (activePlayingChannel) {
    renderQueueList();
  }
}

// Render dynamic channel grid (Flat and Paginated for 2GB RAM device optimization)
function renderGrid() {
  container.innerHTML = '';
  paginationContainer.innerHTML = '';

  if (currentFilteredChannels.length === 0) {
    container.innerHTML = '<div class="col-span-full text-center text-text-secondary py-20 text-xs font-bold uppercase tracking-wider">No channels found matching active filters.</div>';
    return;
  }

  // Calculate pages
  const totalPages = Math.ceil(currentFilteredChannels.length / itemsPerPage);
  if (currentPage > totalPages) currentPage = totalPages || 1;

  const startIdx = (currentPage - 1) * itemsPerPage;
  const endIdx = startIdx + itemsPerPage;
  const paginatedChannels = currentFilteredChannels.slice(startIdx, endIdx);

  // Render cards flat directly in the container grid
  paginatedChannels.forEach(ch => {
    const status = channelStatusMap[ch.url] || 'unknown';
    let badgeHtml = '';
    if (status === 'active') {
      badgeHtml = '<div class="absolute top-2 left-2 bg-text-tertiary text-white text-[10px] font-bold px-1.5 py-0.5 rounded tracking-wide z-10 uppercase">🔴 Live</div>';
    } else if (status === 'isp_bdix') {
      badgeHtml = '<div class="absolute top-2 left-2 bg-blue-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded tracking-wide z-10 uppercase">🔵 BDIX</div>';
    } else if (status === 'blocked') {
      badgeHtml = '<div class="absolute top-2 left-2 bg-yellow-500 text-black text-[10px] font-bold px-1.5 py-0.5 rounded tracking-wide z-10 uppercase">🟡 Geo</div>';
    } else if (status === 'down') {
      badgeHtml = '<div class="absolute top-2 left-2 bg-red-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded tracking-wide z-10 uppercase">🔴 Off</div>';
    }

    const card = document.createElement('div');
    card.className = 'channel-card-container relative w-full aspect-[16/11] rounded-xs cursor-pointer overflow-hidden shadow-1 flex flex-col justify-between items-center p-3 border border-border-default';
    card.tabIndex = 0;
    card.role = 'button';
    card.setAttribute('aria-label', `Play ${ch.name}`);
    
    card.innerHTML = `
      ${badgeHtml}
      <div class="w-full flex-1 flex items-center justify-center p-1 min-h-0">
        <img src="${ch.logo}" class="max-w-full max-h-12 object-contain transition-transform duration-300 group-hover:scale-105" loading="lazy" onerror="this.src='https://via.placeholder.com/150/ffffff/000000?text=${encodeURIComponent(ch.name)}'">
      </div>
      <div class="w-full text-center border-t border-border-default pt-2 mt-1">
        <div class="text-[12px] font-bold text-text-primary truncate tracking-tight uppercase">${ch.name}</div>
        <div class="text-[10px] font-medium text-text-secondary truncate tracking-tight uppercase mt-0.5">${ch.country} • ${ch.server}</div>
      </div>
    `;

    const playAction = () => openPlayer(ch);
    card.addEventListener('click', playAction);
    card.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        playAction();
      }
    });
    container.appendChild(card);
  });

  // Render pagination buttons if there is more than 1 page
  if (totalPages > 1) {
    const prevBtn = document.createElement('button');
    prevBtn.className = 'page-btn';
    prevBtn.innerText = '◄ Prev';
    prevBtn.disabled = currentPage === 1;
    prevBtn.onclick = () => {
      currentPage--;
      renderGrid();
      document.getElementById('search-input').scrollIntoView({ behavior: 'smooth', block: 'center' });
    };

    const pageInfo = document.createElement('span');
    pageInfo.className = 'page-info';
    pageInfo.innerText = `Page ${currentPage} of ${totalPages}`;

    const nextBtn = document.createElement('button');
    nextBtn.className = 'page-btn';
    nextBtn.innerText = 'Next ►';
    nextBtn.disabled = currentPage === totalPages;
    nextBtn.onclick = () => {
      currentPage++;
      renderGrid();
      document.getElementById('search-input').scrollIntoView({ behavior: 'smooth', block: 'center' });
    };

    paginationContainer.appendChild(prevBtn);
    paginationContainer.appendChild(pageInfo);
    paginationContainer.appendChild(nextBtn);
  }
}

// Render player queue sidebar list (limited to 40 related channels to avoid lag)
function renderQueueList() {
  queueList.innerHTML = '';
  if (!activePlayingChannel) return;

  // Filter by group (same category)
  let relatedChannels = allTvChannels.filter(ch => ch.group === activePlayingChannel.group);
  
  // Pull the active playing channel to the front of the list
  relatedChannels = [
    activePlayingChannel,
    ...relatedChannels.filter(ch => ch.url !== activePlayingChannel.url)
  ];
  
  // Limit to 40 related channels
  const queueLimit = 40;
  const queuedChannels = relatedChannels.slice(0, queueLimit);
  
  queueCountEl.innerText = queuedChannels.length;

  queuedChannels.forEach(ch => {
    const item = document.createElement('div');
    const isPlaying = activePlayingChannel && activePlayingChannel.url === ch.url;
    
    item.className = `queue-item flex items-center gap-3 p-3 cursor-pointer ${isPlaying ? 'active' : ''}`;
    item.innerHTML = `
      <img src="${ch.logo}" class="w-10 h-7 object-contain bg-white border border-border-default rounded" onerror="this.src='https://via.placeholder.com/150/ffffff/000000?text=TV'">
      <div class="flex-1 min-w-0">
        <div class="text-[12px] font-bold text-text-primary truncate uppercase">${ch.name}</div>
        <div class="text-[10px] font-medium text-text-secondary truncate uppercase mt-0.5">${ch.country} • ${ch.server}</div>
      </div>
      ${isPlaying ? '<span class="text-text-tertiary text-xs">▶</span>' : ''}
    `;

    item.onclick = () => {
      openPlayer(ch);
    };
    queueList.appendChild(item);
  });
}

// Open video player (split layout) with automatic CORS proxy fallback support
function openPlayer(channel, useProxy = false) {
  activePlayingChannel = channel;
  
  // Show player, scroll to it smoothly
  playerContainer.classList.remove('hidden');
  playerContainer.classList.add('flex');
  playerContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });

  // Update Metadata Card
  playerDetailsLogo.src = channel.logo;
  playerDetailsTitle.innerText = channel.name;
  playerDetailsCountry.innerText = channel.country;
  playerDetailsServer.innerText = channel.server;

  // Push browser history state
  history.pushState({ channel: channel }, channel.name, `?play=${encodeURIComponent(channel.name)}`);

  // Render Queue list items
  renderQueueList();

  // Load stream URL
  let playUrl = channel.url;
  const isPrivate = isPrivateIp(playUrl);
  
  const isHttp = playUrl.startsWith('http:');
  const isHttpsPage = window.location.protocol === 'https:';
  
  if (isHttp && isHttpsPage && !isPrivate) {
     useProxy = true;
  }
  
  window.useCorsProxy = useProxy && !isPrivate;

  if (playerInstance) {
    playerInstance.dispose();
    playerInstance = null;
  }
  
  const newVideoEl = document.createElement('video');
  newVideoEl.id = 'video-player';
  newVideoEl.className = 'video-js vjs-default-skin vjs-16-9 vjs-big-play-centered';
  newVideoEl.setAttribute('controls', 'true');
  newVideoEl.setAttribute('preload', 'auto');
  videoContainer.insertBefore(newVideoEl, errorOverlay);

  errorOverlay.classList.add('hidden');

  const type = playUrl.includes('.mpd') ? 'application/dash+xml' : (playUrl.includes('.m3u8') ? 'application/x-mpegURL' : 'video/mp4');

  playerInstance = videojs(newVideoEl, {
    liveui: true,
    autoplay: true,
    fluid: true
  });

  let finalUrl = playUrl;
  if (window.useCorsProxy) {
     finalUrl = `https://corsproxy.io/?url=${encodeURIComponent(playUrl)}`;
  }

  playerInstance.src({ src: finalUrl, type: type });

  playerInstance.on('error', function() {
    console.error('Video.js Error', playerInstance.error());
    if (!window.useCorsProxy && !isPrivate) {
      console.log('Retrying playback with CORS proxy fallback...');
      openPlayer(channel, true);
    } else {
      showPlayerError(playUrl);
    }
  });

  errorTimeout = setTimeout(() => {
    if (playerInstance && !playerInstance.hasStarted()) {
      clearTimeout(errorTimeout);
      if (!window.useCorsProxy && !isPrivate) {
        openPlayer(channel, true);
      } else {
        showPlayerError(playUrl);
      }
    }
  }, 10000);

  playerInstance.on('playing', () => {
    clearTimeout(errorTimeout);
  });
}

// Close player
function closePlayer() {
  activePlayingChannel = null;
  playerContainer.classList.remove('flex');
  playerContainer.classList.add('hidden');
  
  clearTimeout(errorTimeout);
  
  if (playerInstance) {
    playerInstance.dispose();
    playerInstance = null;
  }
  history.pushState(null, '', window.location.pathname);
}

closePlayerBtn.onclick = closePlayer;



// Filter event handlers
searchInput.addEventListener('input', (e) => {
  searchQuery = e.target.value;
  applyFilters();
});

filterCategory.addEventListener('change', (e) => {
  selectedCategory = e.target.value;
  renderQuickCategoryPills();
  applyFilters();
});

filterServer.addEventListener('change', (e) => {
  selectedServer = e.target.value;
  applyFilters();
});

filterResetBtn.addEventListener('click', () => {
  selectedCategory = 'all';
  selectedCountry = 'all';
  selectedServer = 'all';
  searchQuery = '';
  
  searchInput.value = '';
  filterCategory.value = 'all';
  filterServer.value = 'all';
  
  clearCountryFilterBtn.classList.add('hidden');
  
  populateFilters();
  applyFilters();
});

clearCountryFilterBtn.onclick = () => {
  selectedCountry = 'all';
  clearCountryFilterBtn.classList.add('hidden');
  renderCountryPills();
  applyFilters();
};

// Handle URL play query parameters on page load
function handleUrlParams() {
  if (activePlayingChannel) return;
  const params = new URLSearchParams(window.location.search);
  const channelName = params.get('play');
  if (channelName) {
    const decodedName = decodeURIComponent(channelName);
    const channel = allTvChannels.find(ch => ch.name.toLowerCase() === decodedName.toLowerCase());
    if (channel) {
      openPlayer(channel);
    }
  }
}

// Handle Browser Back/Forward history buttons
window.addEventListener('popstate', (event) => {
  if (event.state && event.state.channel) {
    openPlayer(event.state.channel, false);
  } else {
    closePlayer();
  }
});

// App Initialization
async function initApp() {
  container.innerHTML = '<div class="flex justify-center items-center h-64"><div class="spinner"></div></div>';
  
  // Try to load channel status first (non-blocking)
  try {
    const statusResp = await fetch(decodeUrl('aHR0cHM6Ly9yYXcuZ2l0aHVidXNlcmNvbnRlbnQuY29tL1phbWFuLVRvcHUvSXAtdHYtQ29sbGVjdGlvbi9tYWluL2NoYW5uZWxfc3RhdHVzLmpzb24='));
    if (statusResp.ok) {
      channelStatusMap = await statusResp.json();
    }
  } catch(e) {
    console.log("Could not load channel status map", e);
  }
  
  if (allTvChannels.length === 0) {
    container.innerHTML = '<div class="flex flex-col justify-center items-center h-64 gap-4"><div class="spinner"></div><p class="text-gray-400 text-sm" id="load-msg">Loading main channels...</p></div>';

    // Step 1: Load main channels first
    const mainTv = await loadPlaylist(M3U_URL_LIVE);

    allTvChannels = mainTv;
    currentFilteredChannels = allTvChannels;
    
    populateFilters();
    applyFilters();
    
    // Auto-play channel from URL parameter if specified
    handleUrlParams();

    // Step 2: Load extra sources in background
    Promise.all(EXTRA_LIVE_SOURCES.map(url => loadPlaylist(url))).then(extraResults => {
      const seenUrls = new Set(allTvChannels.map(ch => ch.url));
      const newChannels = [];
      for (const ch of extraResults.flat()) {
        if (ch.url && !seenUrls.has(ch.url)) {
          seenUrls.add(ch.url);
          newChannels.push(ch);
        }
      }
      if (newChannels.length > 0) {
        allTvChannels = [...allTvChannels, ...newChannels];
        populateFilters();
        applyFilters();
        
        // Re-check URL parameter auto-play (in case target channel was in the extra playlist)
        handleUrlParams();
      }
    });
  } else {
    applyFilters();
    handleUrlParams();
  }
}

// Initialise App
initApp();
