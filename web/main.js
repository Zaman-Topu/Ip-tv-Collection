import './style.css';
import Hls from 'hls.js';
import { MediaPlayer } from 'dashjs';

const M3U_URL_LIVE = "https://raw.githubusercontent.com/Zaman-Topu/Ip-tv-Collection/main/FINAL_IPTV_COMPLETE.m3u";

// Extra IPTV sources
const EXTRA_LIVE_SOURCES = [
  "https://raw.githubusercontent.com/Monjil404/livetv/refs/heads/main/pro",           // TechEasyLife
  "https://raw.githubusercontent.com/Monjil404/TVspo/refs/heads/main/tvs",           // Sports
  "https://raw.githubusercontent.com/abusaeeidx/Mrgify-BDIX-IPTV/main/playlist.m3u", // Mrgify BDIX
  "https://raw.githubusercontent.com/ashik4u/mrgify-clean/main/playlist.m3u",        // Mrgify Clean
  "https://raw.githubusercontent.com/imShakil/tvlink/refs/heads/main/iptv.m3u8",     // imShakil
  "https://raw.githubusercontent.com/tvbd/m3uplayer/refs/heads/main/m3u/xniptv.m3u", // Xniptv
  "https://raw.githubusercontent.com/time2shine/IPTV/master/combined.m3u",           // time2shine
  "https://raw.githubusercontent.com/ShamimHossainOfficial/IPTV/master/BDIX-IPTV.m3u8", // ShamimHossain
  "https://raw.githubusercontent.com/Shadmanislam/bdiptv/master/BD%20IPTV.m3u",     // Shadmanislam
  "https://raw.githubusercontent.com/DrSujonPaul/Sujon/6dc6a1d4eaa20a9239ae27d8e0f00182b60eeb47/iptv", // DrSujonPaul
  "https://raw.githubusercontent.com/srhady/Hady/refs/heads/main/akash_live.m3u",   // Akash Live
  "https://raw.githubusercontent.com/bugsfreeweb/LiveTVCollector/main/LiveTV/Bangladesh/LiveTV.m3u", // Bugsfree BD
  "https://raw.githubusercontent.com/bugsfreeweb/LiveTVCollector/main/LiveTV/India/LiveTV.m3u",     // Bugsfree India
  "https://lupael.github.io/IPTV/running.m3u",                                       // lupael
  "https://raw.githubusercontent.com/srhady/axsports/refs/heads/main/playlist.m3u"  // Axsport
];

let hlsInstance = null;
let dashInstance = null;
let errorTimeout = null;
const videoEl = document.getElementById('video-player');
const playerContainer = document.getElementById('player-container');
const queueList = document.getElementById('player-queue-list');
const queueCountEl = document.getElementById('queue-count');
const closePlayerBtn = document.getElementById('close-player');

// Player Details Elements
const playerDetailsLogo = document.getElementById('player-details-logo');
const playerDetailsTitle = document.getElementById('player-details-title');
const playerDetailsCountry = document.getElementById('player-details-country');
const playerDetailsServer = document.getElementById('player-details-server');

// Custom Controls Elements
const playPauseBtn = document.getElementById('play-pause-btn');
const playIcon = document.getElementById('play-icon');
const pauseIcon = document.getElementById('pause-icon');
const muteBtn = document.getElementById('mute-btn');
const muteIcon = document.getElementById('mute-icon');
const volumeSlider = document.getElementById('volume-slider');
const fullscreenBtn = document.getElementById('fullscreen-btn');
const fsEnter = document.getElementById('fs-enter');
const fsExit = document.getElementById('fs-exit');
const timeDisplay = document.getElementById('current-time');
const bufferingSpinner = document.getElementById('buffering-spinner');
const centerPlayOverlay = document.getElementById('center-play-overlay');
const errorOverlay = document.getElementById('player-error');

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

  // Update Stats Count
  feedCountEl.innerText = `${currentFilteredChannels.length} OF ${allTvChannels.length}`;

  renderGrid();
  
  // Update Queue list if Player is active
  if (activePlayingChannel) {
    renderQueueList();
  }
}

// Render dynamic channel grid
function renderGrid() {
  container.innerHTML = '';

  if (currentFilteredChannels.length === 0) {
    container.innerHTML = '<div class="text-center text-text-secondary py-20 text-xs font-bold uppercase tracking-wider">No channels found matching active filters.</div>';
    return;
  }

  // Group by category to match Netflix/Dude rows
  const grouped = {};
  currentFilteredChannels.forEach(ch => {
    if (!grouped[ch.group]) grouped[ch.group] = [];
    grouped[ch.group].push(ch);
  });

  // Sort groups by category names
  const sortedGroups = Object.entries(grouped).sort((a, b) => a[0].localeCompare(b[0]));

  sortedGroups.forEach(([group, channels]) => {
    const row = document.createElement('div');
    row.className = 'mb-10';
    
    const title = document.createElement('h3');
    title.className = 'text-xs font-bold text-text-primary uppercase tracking-widest border-b border-border-default pb-2 mb-4';
    title.innerText = group;
    
    const grid = document.createElement('div');
    grid.className = 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4';
    
    channels.forEach(ch => {
      const status = channelStatusMap[ch.url] || 'unknown';
      let badgeHtml = '';
      if (status === 'active') {
        badgeHtml = '<div class="absolute top-2 left-2 bg-text-tertiary text-white text-[8px] font-bold px-1.5 py-0.5 rounded tracking-wide z-10 uppercase">🔴 Live</div>';
      } else if (status === 'isp_bdix') {
        badgeHtml = '<div class="absolute top-2 left-2 bg-blue-500 text-white text-[8px] font-bold px-1.5 py-0.5 rounded tracking-wide z-10 uppercase">🔵 BDIX</div>';
      } else if (status === 'blocked') {
        badgeHtml = '<div class="absolute top-2 left-2 bg-yellow-500 text-black text-[8px] font-bold px-1.5 py-0.5 rounded tracking-wide z-10 uppercase">🟡 Geo</div>';
      } else if (status === 'down') {
        badgeHtml = '<div class="absolute top-2 left-2 bg-red-600 text-white text-[8px] font-bold px-1.5 py-0.5 rounded tracking-wide z-10 uppercase">🔴 Off</div>';
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
          <div class="text-[10px] font-bold text-text-primary truncate tracking-tight uppercase">${ch.name}</div>
          <div class="text-[8px] font-medium text-text-secondary truncate tracking-tight uppercase mt-0.5">${ch.country} • ${ch.server}</div>
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
      grid.appendChild(card);
    });

    row.appendChild(title);
    row.appendChild(grid);
    container.appendChild(row);
  });
}

// Render player queue sidebar list
function renderQueueList() {
  queueList.innerHTML = '';
  queueCountEl.innerText = currentFilteredChannels.length;

  currentFilteredChannels.forEach(ch => {
    const item = document.createElement('div');
    const isPlaying = activePlayingChannel && activePlayingChannel.url === ch.url;
    
    item.className = `queue-item flex items-center gap-3 p-3 cursor-pointer ${isPlaying ? 'active' : ''}`;
    item.innerHTML = `
      <img src="${ch.logo}" class="w-10 h-7 object-contain bg-white border border-border-default rounded" onerror="this.src='https://via.placeholder.com/150/ffffff/000000?text=TV'">
      <div class="flex-1 min-w-0">
        <div class="text-[10px] font-bold text-text-primary truncate uppercase">${ch.name}</div>
        <div class="text-[8px] font-medium text-text-secondary truncate uppercase mt-0.5">${ch.country} • ${ch.server}</div>
      </div>
      ${isPlaying ? '<span class="text-text-tertiary text-xs">▶</span>' : ''}
    `;

    item.onclick = () => {
      openPlayer(ch);
    };
    queueList.appendChild(item);
  });
}

// Open video player (split layout)
function openPlayer(channel) {
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

  if (hlsInstance) {
    hlsInstance.destroy();
    hlsInstance = null;
  }
  if (dashInstance) {
    dashInstance.destroy();
    dashInstance = null;
  }
  errorOverlay.classList.add('hidden');
  bufferingSpinner.classList.remove('hidden');
  centerPlayOverlay.classList.add('hidden');

  // Handle MPEG-DASH (.mpd)
  if (playUrl.includes('.mpd')) {
    dashInstance = MediaPlayer().create();
    dashInstance.updateSettings({
      streaming: {
        retryAttempts: { MPD: 1, MediaSegment: 1, InitializationSegment: 1 },
        retryIntervals: { MPD: 500, MediaSegment: 500, InitializationSegment: 500 }
      }
    });

    dashInstance.initialize(videoEl, playUrl, true);
    
    dashInstance.on(MediaPlayer.events.PLAYBACK_STARTED, () => {
      bufferingSpinner.classList.add('hidden');
      errorOverlay.classList.add('hidden');
    });
    
    dashInstance.on(MediaPlayer.events.ERROR, (e) => {
      console.error('DASH Error', e);
      bufferingSpinner.classList.add('hidden');
      errorOverlay.classList.remove('hidden');
    });
    
    errorTimeout = setTimeout(() => {
      if (!videoEl.paused || videoEl.readyState >= 3) {
        clearTimeout(errorTimeout);
        return;
      }
      if (dashInstance) {
        dashInstance.destroy();
        dashInstance = null;
      }
      bufferingSpinner.classList.add('hidden');
      errorOverlay.classList.remove('hidden');
    }, 15000);
    
    videoEl.addEventListener('playing', () => clearTimeout(errorTimeout), { once: true });
    return;
  }

  // Handle HLS (.m3u8)
  if (Hls.isSupported()) {
    hlsInstance = new Hls({
      maxMaxBufferLength: 15,
      enableWorker: true,
      lowLatencyMode: true,
      manifestLoadingTimeOut: 5000,
      fragLoadingMaxRetry: 1
    });
    hlsInstance.loadSource(playUrl);
    hlsInstance.attachMedia(videoEl);
    
    errorTimeout = setTimeout(() => {
      if (!videoEl.paused || videoEl.readyState >= 3) {
        clearTimeout(errorTimeout);
        return;
      }
      if (hlsInstance) {
        hlsInstance.destroy();
        hlsInstance = null;
      }
      bufferingSpinner.classList.add('hidden');
      errorOverlay.classList.remove('hidden');
    }, 15000);
    
    videoEl.addEventListener('playing', () => clearTimeout(errorTimeout), { once: true });
    
    hlsInstance.on(Hls.Events.MANIFEST_PARSED, () => {
      clearTimeout(errorTimeout);
      bufferingSpinner.classList.add('hidden');
      errorOverlay.classList.add('hidden');
      videoEl.play().catch(e => {
        console.warn('Playback prevented', e);
        centerPlayOverlay.classList.remove('hidden');
      });
    });
    
    hlsInstance.on(Hls.Events.ERROR, (event, data) => {
      if (data.fatal) {
        bufferingSpinner.classList.add('hidden');
        errorOverlay.classList.remove('hidden');
        hlsInstance.destroy();
      }
    });
  } else if (videoEl.canPlayType('application/vnd.apple.mpegurl')) {
    // Safari fallback
    videoEl.src = playUrl;
    videoEl.addEventListener('loadedmetadata', () => {
      videoEl.play();
    });
  }
}

// Close player
function closePlayer() {
  activePlayingChannel = null;
  playerContainer.classList.remove('flex');
  playerContainer.classList.add('hidden');
  
  clearTimeout(errorTimeout);
  
  if (hlsInstance) {
    hlsInstance.destroy();
    hlsInstance = null;
  }
  if (dashInstance) {
    dashInstance.destroy();
    dashInstance = null;
  }
  videoEl.pause();
  videoEl.src = '';
  history.pushState(null, '', '/Ip-tv-Collection/');
}

closePlayerBtn.onclick = closePlayer;

// Player custom controls listeners
playPauseBtn.addEventListener('click', () => {
  if (videoEl.paused) {
    videoEl.play();
    playIcon.classList.add('hidden');
    pauseIcon.classList.remove('hidden');
  } else {
    videoEl.pause();
    playIcon.classList.remove('hidden');
    pauseIcon.classList.add('hidden');
  }
});

videoEl.addEventListener('play', () => {
  playIcon.classList.add('hidden');
  pauseIcon.classList.remove('hidden');
});

videoEl.addEventListener('pause', () => {
  playIcon.classList.remove('hidden');
  pauseIcon.classList.add('hidden');
});

muteBtn.addEventListener('click', () => {
  videoEl.muted = !videoEl.muted;
  if (videoEl.muted) {
    muteIcon.classList.remove('hidden');
    volIcon.classList.add('hidden');
  } else {
    muteIcon.classList.add('hidden');
    volIcon.classList.remove('hidden');
  }
});

volumeSlider.addEventListener('input', (e) => {
  videoEl.volume = e.target.value;
  videoEl.muted = (e.target.value == 0);
});

fullscreenBtn.addEventListener('click', () => {
  if (!document.fullscreenElement) {
    videoContainer.requestFullscreen().catch(err => console.log(err));
    fsEnter.classList.add('hidden');
    fsExit.classList.remove('hidden');
  } else {
    document.exitFullscreen();
    fsEnter.classList.remove('hidden');
    fsExit.classList.add('hidden');
  }
});

centerPlayOverlay.onclick = () => {
  videoEl.play();
  centerPlayOverlay.classList.add('hidden');
};

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

// Handle Browser Back/Forward history buttons
window.addEventListener('popstate', (event) => {
  if (event.state && event.state.channel) {
    openPlayer(event.state.channel);
  } else {
    closePlayer();
  }
});

// App Initialization
async function initApp() {
  container.innerHTML = '<div class="flex justify-center items-center h-64"><div class="spinner"></div></div>';
  
  // Try to load channel status first (non-blocking)
  try {
    const statusResp = await fetch('https://raw.githubusercontent.com/Zaman-Topu/Ip-tv-Collection/main/channel_status.json');
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
      }
    });
  } else {
    applyFilters();
  }
}

// Initialise App
initApp();
