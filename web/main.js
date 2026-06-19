import './style.css';
import Hls from 'hls.js';
import dashjs from 'dashjs';

const M3U_URL_LIVE = "https://raw.githubusercontent.com/Zaman-Topu/Ip-tv-Collection/main/FINAL_IPTV_COMPLETE.m3u";
const M3U_URL_MOVIES = "https://raw.githubusercontent.com/Zaman-Topu/Ip-tv-Collection/main/FINAL_MOVIES_COMPLETE.m3u";

let hlsInstance = null;
let dashInstance = null;
const videoEl = document.getElementById('video-player');
const playerView = document.getElementById('player-view');
const homeView = document.getElementById('home-view');
const playerTitle = document.getElementById('player-title');
const relatedList = document.getElementById('related-list');
const sidebar = document.getElementById('related-sidebar');
const topControls = document.getElementById('player-controls-top');
const bottomControls = document.getElementById('player-controls-bottom');
const videoContainer = document.getElementById('video-container');

// Custom Controls Elements
const playPauseBtn = document.getElementById('play-pause-btn');
const playIcon = document.getElementById('play-icon');
const pauseIcon = document.getElementById('pause-icon');
const muteBtn = document.getElementById('mute-btn');
const muteIcon = document.getElementById('mute-icon');
const volIcon = document.getElementById('vol-icon');
const volumeSlider = document.getElementById('volume-slider');
const fullscreenBtn = document.getElementById('fullscreen-btn');
const fsEnter = document.getElementById('fs-enter');
const fsExit = document.getElementById('fs-exit');
const qualityBtn = document.getElementById('quality-btn');
const qualityMenu = document.getElementById('quality-menu');
const progressBar = document.getElementById('progress-bar');
const progressContainer = document.getElementById('progress-container');
const timeDisplay = document.getElementById('current-time');
const bufferingSpinner = document.getElementById('buffering-spinner');
const centerPlayOverlay = document.getElementById('center-play-overlay');
const errorOverlay = document.getElementById('player-error');

// UI Elements
const container = document.getElementById('category-container');
const heroTitle = document.getElementById('hero-title');
const heroDesc = document.getElementById('hero-desc');
const heroSection = document.getElementById('hero-section');
const heroPlayBtn = document.getElementById('hero-play');
let featuredChannel = null;

// State
let allTvChannels = [];
let allMovieChannels = [];
let currentChannels = [];
let currentCategoryMap = {};
let channelStatusMap = {};

// Parse M3U
async function loadPlaylist(url) {
  try {
    const response = await fetch(url);
    const text = await response.text();
    return parseM3U(text);
  } catch (error) {
    console.error("Error fetching playlist:", error);
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
      // Extract Logo
      const logoMatch = line.match(/tvg-logo="([^"]+)"/);
      currentChannel.logo = logoMatch ? logoMatch[1] : 'https://via.placeholder.com/150/141414/ffffff?text=No+Logo';
      
      // Extract Group
      const groupMatch = line.match(/group-title="([^"]+)"/);
      currentChannel.group = groupMatch ? groupMatch[1] : 'Others';
      
      // Extract Name
      const nameParts = line.split(',');
      currentChannel.name = nameParts.length > 1 ? nameParts[1].trim() : 'Unknown Channel';
    } else if (line.startsWith('http')) {
      currentChannel.url = line;
      channels.push({ ...currentChannel });
      currentChannel = {};
    }
  }
  return channels;
}

function groupByCategory(channels) {
  const map = {};
  channels.forEach(ch => {
    let group = ch.group;
    
    // Rename and Merge categories to match user preference
    if (group === 'International News') group = 'News';
    else if (group === 'Music') group = 'Song';
    else if (group === 'Cartoon & Kids') group = 'Kids';
    else if (group === 'Natok & Drama' || group === 'English' || group === 'India') group = 'Entertainment';
    
    if (!map[group]) map[group] = [];
    map[group].push(ch);
  });
  return map;
}

// Render UI
function renderCategories(categoryMap) {
  container.innerHTML = ''; // Clear loader
  
  const desiredOrder = [
    'News',
    'Song',
    'Entertainment',
    'Sports',
    'Kids',
    'Bangladesh',
    'Movies',
    'Documentary',
    'Religion',
    'Countrywise',
    'Others',
    'Search Results'
  ];

  const sortedEntries = Object.entries(categoryMap).sort((a, b) => {
    let indexA = desiredOrder.indexOf(a[0]);
    let indexB = desiredOrder.indexOf(b[0]);
    if (indexA === -1) indexA = 999;
    if (indexB === -1) indexB = 999;
    
    // If both have same index (e.g. 999), sort alphabetically
    if (indexA === indexB) return a[0].localeCompare(b[0]);
    return indexA - indexB;
  });

  for (const [group, channels] of sortedEntries) {
    if (channels.length === 0) continue;
    
    // Sort channels: Live/BDIX first, then unknown/geo, then offline
    const sortedChannels = [...channels].sort((a, b) => {
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
    
    const row = document.createElement('div');
    row.className = 'mb-10';
    
    const title = document.createElement('h2');
    title.className = 'text-2xl font-bold mb-4 text-white px-2';
    title.innerText = group;
    row.appendChild(title);
    
    const slider = document.createElement('div');
    slider.className = 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 py-4 px-2';
    
    // Render all channels in the group
    sortedChannels.forEach(ch => {
      const status = channelStatusMap[ch.url] || 'unknown';
      let badgeHtml = '';
      if (status === 'active') {
          badgeHtml = '<div class="absolute top-2 right-2 bg-green-500/90 text-white text-[10px] font-bold px-2 py-0.5 rounded shadow backdrop-blur-md z-10 border border-green-400/30">🟢 LIVE</div>';
      } else if (status === 'isp_bdix') {
          badgeHtml = '<div class="absolute top-2 right-2 bg-blue-500/90 text-white text-[10px] font-bold px-2 py-0.5 rounded shadow backdrop-blur-md z-10 border border-blue-400/30">🔵 BDIX</div>';
      } else if (status === 'blocked') {
          badgeHtml = '<div class="absolute top-2 right-2 bg-yellow-500/90 text-black text-[10px] font-bold px-2 py-0.5 rounded shadow backdrop-blur-md z-10 border border-yellow-400/30">🟡 GEO</div>';
      } else if (status === 'down') {
          badgeHtml = '<div class="absolute top-2 right-2 bg-red-600/90 text-white text-[10px] font-bold px-2 py-0.5 rounded shadow backdrop-blur-md z-10 border border-red-400/30">🔴 OFFLINE</div>';
      }

      const card = document.createElement('div');
      card.className = 'relative w-full aspect-video rounded-md cursor-pointer overflow-hidden bg-gradient-to-br from-gray-800 to-gray-900 shadow-lg transform transition-all duration-300 hover:scale-110 hover:shadow-2xl hover:border hover:border-white/20 hover:z-50 group flex flex-col justify-center items-center';
      card.innerHTML = `
        ${badgeHtml}
        <img src="${ch.logo}" class="w-24 h-24 object-contain transition-transform duration-500 group-hover:scale-75 group-hover:-translate-y-2 drop-shadow-lg" loading="lazy" onerror="this.src='https://via.placeholder.com/150/141414/ffffff?text=No+Logo'">
        <div class="absolute bottom-0 left-0 w-full bg-gradient-to-t from-black via-black/80 to-transparent text-white text-sm font-bold text-center p-3 pt-6 opacity-0 group-hover:opacity-100 transition-opacity duration-300 truncate tracking-wide">${ch.name}</div>
      `;
      card.addEventListener('click', () => openPlayer(ch));
      slider.appendChild(card);
    });
    
    row.appendChild(title);
    row.appendChild(slider);
    container.appendChild(row);
  }
}

// Set Featured Hero
function setHero(channel) {
  featuredChannel = channel;
  heroTitle.innerText = channel.name;
  heroDesc.innerText = `Watch ${channel.name} live directly in your browser. Part of the ${channel.group} category.`;
  // Set hero background to logo (blurred)
  heroSection.style.backgroundImage = `linear-gradient(to right, rgba(20,20,20,1) 0%, rgba(20,20,20,0.6) 50%, rgba(20,20,20,0) 100%), url('${channel.logo}')`;
  heroSection.style.backgroundSize = 'contain';
}

heroPlayBtn.addEventListener('click', () => {
  if (featuredChannel) openPlayer(featuredChannel);
});

// Playback Logic
function openPlayer(channel, useProxyIndex = 0, isHistoryBack = false) {
  playerTitle.innerText = channel.name;
  
  // Hide Home, Show Player
  homeView.classList.remove('block');
  homeView.classList.add('hidden');
  playerView.classList.remove('hidden');
  playerView.classList.add('block');
  sidebar.classList.add('translate-x-full'); // hide sidebar initially
  
  window.scrollTo(0,0);
  errorOverlay.style.display = 'none';
  bufferingSpinner.classList.remove('hidden'); // Show spinner on initial load
  centerPlayOverlay.classList.add('hidden');
  
  // Push History State
  if (!isHistoryBack) {
    history.pushState({ channel: channel }, channel.name, `?play=${encodeURIComponent(channel.name)}`);
  }
  
  // Populate Related Sidebar
  relatedList.innerHTML = '';
  const relatedChannels = currentCategoryMap[channel.group] || [];
  relatedChannels.forEach(rel => {
    if (rel.name === channel.name) return;
    const item = document.createElement('div');
    item.className = 'flex items-center gap-4 p-3 rounded-lg cursor-pointer transition hover:bg-gray-800 mb-2';
    item.innerHTML = `
      <img src="${rel.logo}" class="w-16 h-10 object-contain bg-black rounded" onerror="this.src='https://via.placeholder.com/150/141414/ffffff?text=No+Logo'">
      <div class="flex-1 overflow-hidden">
        <div class="text-sm font-medium text-white truncate">${rel.name}</div>
      </div>
    `;
    item.addEventListener('click', () => {
      openPlayer(rel);
    });
    relatedList.appendChild(item);
  });
  
  let playUrl = channel.url;
  
  const proxies = [
    '', // Direct
    'https://api.allorigins.win/raw?url=',
    'https://corsproxy.io/?',
    'https://thingproxy.freeboard.io/fetch/',
    'https://api.codetabs.com/v1/proxy?quest='
  ];
  let currentProxyIndex = useProxyIndex || 0;
  
  if (currentProxyIndex > 0) {
    playUrl = proxies[currentProxyIndex] + encodeURIComponent(channel.url);
  }

  if (hlsInstance) {
    hlsInstance.destroy();
    hlsInstance = null;
  }
  if (dashInstance) {
    dashInstance.destroy();
    dashInstance = null;
  }

  // Handle MPEG-DASH Streams
  if (playUrl.includes('.mpd') || playUrl.includes('.mp4')) {
    dashInstance = dashjs.MediaPlayer().create();
    
    // Intercept requests to route them through our CORS proxy
    if (currentProxyIndex > 0) {
      dashInstance.extend("RequestModifier", function () {
        return {
          modifyRequestURL: function (url) {
            // Avoid double-proxying
            if (!url.startsWith(proxies[currentProxyIndex])) {
              return proxies[currentProxyIndex] + encodeURIComponent(url);
            }
            return url;
          }
        };
      });
    }

    dashInstance.initialize(videoEl, playUrl, true);
    
    dashInstance.on(dashjs.MediaPlayer.events.PLAYBACK_STARTED, () => {
      bufferingSpinner.classList.add('hidden');
      errorOverlay.style.display = 'none';
      qualityMenu.innerHTML = ''; // Basic support for now
    });
    
    dashInstance.on(dashjs.MediaPlayer.events.ERROR, (e) => {
      console.error('DASH Error', e);
      if (currentProxyIndex < proxies.length - 1) {
        openPlayer(channel, currentProxyIndex + 1, true);
      } else {
        bufferingSpinner.classList.add('hidden');
        errorOverlay.style.display = 'flex';
      }
    });
    return;
  }

  // Handle HLS Streams
  if (Hls.isSupported()) {
    // Custom loader to proxy all sub-requests (chunks, playlists)
    class ProxyLoader extends Hls.DefaultConfig.loader {
      constructor(config) {
        super(config);
      }
      load(context, config, callbacks) {
        if (currentProxyIndex > 0 && context.url && !context.url.startsWith(proxies[currentProxyIndex])) {
          context.url = proxies[currentProxyIndex] + encodeURIComponent(context.url);
        }
        super.load(context, config, callbacks);
      }
    }

    // Faster Startup Config for Live Streams with Fast-Fail for dead links
    hlsInstance = new Hls({
      maxMaxBufferLength: 30,
      maxBufferSize: 30 * 1000 * 1000,
      enableWorker: true,
      lowLatencyMode: true,
      backBufferLength: 90,
      manifestLoadingMaxRetry: 1,
      manifestLoadingTimeOut: 4000,
      levelLoadingMaxRetry: 1,
      fragLoadingMaxRetry: 1,
      pLoader: currentProxyIndex > 0 ? ProxyLoader : Hls.DefaultConfig.loader,
      fLoader: currentProxyIndex > 0 ? ProxyLoader : Hls.DefaultConfig.loader
    });
    hlsInstance.loadSource(playUrl);
    hlsInstance.attachMedia(videoEl);
    
    hlsInstance.on(Hls.Events.MANIFEST_PARSED, (event, data) => {
      bufferingSpinner.classList.add('hidden');
      errorOverlay.style.display = 'none';
      
      // Populate Quality Menu
      qualityMenu.innerHTML = '';
      const autoBtn = document.createElement('button');
      autoBtn.className = 'w-full text-left px-3 py-1 hover:bg-gray-700 text-netflix-red font-bold transition';
      autoBtn.innerText = 'Auto';
      autoBtn.onclick = () => { hlsInstance.currentLevel = -1; qualityMenu.classList.add('hidden'); };
      qualityMenu.appendChild(autoBtn);

      data.levels.forEach((level, index) => {
        const btn = document.createElement('button');
        btn.className = 'w-full text-left px-3 py-1 hover:bg-gray-700 text-white transition';
        btn.innerText = level.height ? `${level.height}p` : `Level ${index}`;
        btn.onclick = () => { hlsInstance.currentLevel = index; qualityMenu.classList.add('hidden'); };
        qualityMenu.appendChild(btn);
      });
      
      videoEl.play().catch(e => {
        console.warn('Auto-play prevented:', e);
        centerPlayOverlay.classList.remove('hidden');
        playIcon.classList.remove('hidden');
        pauseIcon.classList.add('hidden');
      });
    });
    
    hlsInstance.on(Hls.Events.ERROR, (event, data) => {
      if (data.fatal) {
        bufferingSpinner.classList.add('hidden');
        if (data.type === Hls.ErrorTypes.NETWORK_ERROR && currentProxyIndex < proxies.length - 1) {
          // Attempt next proxy fallback
          console.log(`Network error. Trying proxy ${currentProxyIndex + 1}...`);
          errorOverlay.style.display = 'block';
          errorOverlay.innerHTML = `<h3 class="text-netflix-red text-2xl font-bold mb-2">Bypassing Security...</h3><p class="text-gray-300">Trying proxy server ${currentProxyIndex + 1} to bypass CORS...</p>`;
          setTimeout(() => openPlayer(channel, currentProxyIndex + 1), 500);
        } else {
          errorOverlay.style.display = 'block';
          errorOverlay.innerHTML = `<h3 class="text-netflix-red text-2xl font-bold mb-2">Stream Offline / Expired</h3><p class="text-gray-300 text-sm">This channel link is dead or its security token has expired (common for Toffee/Binge). Please try a different channel.</p>`;
          hlsInstance.destroy();
        }
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

function closePlayer() {
  playerView.classList.add('hidden');
  playerView.classList.remove('block');
  homeView.classList.remove('hidden');
  homeView.classList.add('block');
  
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
}

document.getElementById('back-to-browse').addEventListener('click', () => {
  closePlayer();
  history.pushState(null, '', '/');
});

// Sidebar Toggle
document.getElementById('toggle-sidebar').addEventListener('click', () => {
  sidebar.classList.toggle('translate-x-full');
});

// Auto-hide controls when mouse is inactive
let timeout;
playerView.addEventListener('mousemove', () => {
  topControls.classList.remove('opacity-0');
  bottomControls.classList.remove('opacity-0');
  document.body.style.cursor = 'default';
  clearTimeout(timeout);
  timeout = setTimeout(() => {
    topControls.classList.add('opacity-0');
    bottomControls.classList.add('opacity-0');
    document.body.style.cursor = 'none';
    sidebar.classList.add('translate-x-full'); // also hide sidebar on inactive
    qualityMenu.classList.add('hidden'); // hide quality menu
  }, 3000);
});

// Custom Control Logic
playPauseBtn.addEventListener('click', togglePlay);
centerPlayOverlay.addEventListener('click', togglePlay);
videoContainer.addEventListener('click', (e) => {
  // Toggle play if clicking directly on the video, but not on controls
  if (e.target === videoEl || e.target === centerPlayOverlay) {
    togglePlay();
  }
});

function togglePlay() {
  if (videoEl.paused) {
    videoEl.play();
  } else {
    videoEl.pause();
  }
}

videoEl.addEventListener('play', () => {
  playIcon.classList.add('hidden');
  pauseIcon.classList.remove('hidden');
  centerPlayOverlay.classList.add('hidden');
});

videoEl.addEventListener('pause', () => {
  playIcon.classList.remove('hidden');
  pauseIcon.classList.add('hidden');
  // Don't show play overlay if we are loading a new stream
  if (bufferingSpinner.classList.contains('hidden')) {
    centerPlayOverlay.classList.remove('hidden');
  }
});

videoEl.addEventListener('waiting', () => {
  bufferingSpinner.classList.remove('hidden');
});

videoEl.addEventListener('playing', () => {
  bufferingSpinner.classList.add('hidden');
});

videoEl.addEventListener('canplay', () => {
  bufferingSpinner.classList.add('hidden');
});

muteBtn.addEventListener('click', () => {
  videoEl.muted = !videoEl.muted;
  updateVolumeUI();
});

volumeSlider.addEventListener('input', (e) => {
  videoEl.volume = e.target.value;
  videoEl.muted = videoEl.volume === 0;
  updateVolumeUI();
});

function updateVolumeUI() {
  volumeSlider.value = videoEl.muted ? 0 : videoEl.volume;
  if (videoEl.muted || videoEl.volume === 0) {
    muteIcon.classList.remove('hidden');
    volIcon.classList.add('hidden');
  } else {
    muteIcon.classList.add('hidden');
    volIcon.classList.remove('hidden');
  }
}

fullscreenBtn.addEventListener('click', () => {
  if (!document.fullscreenElement) {
    videoContainer.requestFullscreen().catch(err => console.log(err));
  } else {
    document.exitFullscreen();
  }
});

document.addEventListener('fullscreenchange', () => {
  if (document.fullscreenElement) {
    fsEnter.classList.add('hidden');
    fsExit.classList.remove('hidden');
  } else {
    fsEnter.classList.remove('hidden');
    fsExit.classList.add('hidden');
  }
});

qualityBtn.addEventListener('click', () => {
  qualityMenu.classList.toggle('hidden');
});

// Progress Bar Updates (For VODs)
videoEl.addEventListener('timeupdate', () => {
  if (videoEl.duration) {
    const percent = (videoEl.currentTime / videoEl.duration) * 100;
    progressBar.style.width = `${percent}%`;
    
    // Format Time
    const m = Math.floor(videoEl.currentTime / 60).toString().padStart(2, '0');
    const s = Math.floor(videoEl.currentTime % 60).toString().padStart(2, '0');
    const tm = Math.floor(videoEl.duration / 60).toString().padStart(2, '0');
    const ts = Math.floor(videoEl.duration % 60).toString().padStart(2, '0');
    
    if (videoEl.duration === Infinity || isNaN(videoEl.duration)) {
       timeDisplay.innerText = "LIVE";
    } else {
       timeDisplay.innerText = `${m}:${s} / ${tm}:${ts}`;
    }
  } else {
    timeDisplay.innerText = "LIVE";
  }
});

progressContainer.addEventListener('click', (e) => {
  if (videoEl.duration && videoEl.duration !== Infinity) {
    const rect = progressContainer.getBoundingClientRect();
    const pos = (e.clientX - rect.left) / rect.width;
    videoEl.currentTime = pos * videoEl.duration;
  }
});

// Handle Browser Back Button
window.addEventListener('popstate', (event) => {
  if (event.state && event.state.channel) {
    openPlayer(event.state.channel, false, true);
  } else {
    closePlayer();
  }
});

// App Initialization
async function initApp(mode = 'live') {
  container.innerHTML = '<div class="flex justify-center items-center h-64"><div class="spinner"></div></div>';
  heroTitle.innerText = 'Connecting...';
  heroDesc.innerText = 'Connecting to the massive IPTV database.';
  
  // Try to load channel status first (non-blocking)
  try {
    const statusResp = await fetch('https://raw.githubusercontent.com/Zaman-Topu/Ip-tv-Collection/main/channel_status.json');
    if (statusResp.ok) {
      channelStatusMap = await statusResp.json();
    }
  } catch(e) {
    console.log("Could not load channel status map", e);
  }
  
  // Load both playlists if not already loaded
  if (allTvChannels.length === 0 || allMovieChannels.length === 0) {
    const [tvData, movieData] = await Promise.all([
      loadPlaylist(M3U_URL_LIVE),
      loadPlaylist(M3U_URL_MOVIES)
    ]);
    
    // Remove any channel from TV data that exists in Movie data to prevent mixing
    const movieUrls = new Set(movieData.map(m => m.url));
    const pureTvData = tvData.filter(tv => !movieUrls.has(tv.url));
    
    allTvChannels = pureTvData;
    allMovieChannels = movieData;
  }
  
  currentChannels = mode === 'live' ? allTvChannels : allMovieChannels;
  
  if (currentChannels.length > 0) {
    // Pick random hero from a popular category
    const topChannels = currentChannels.filter(c => c.group === 'Bangladesh' || c.group === 'Sports' || c.group === 'Movies' || c.group === 'English');
    const heroPick = topChannels.length > 0 ? topChannels[Math.floor(Math.random() * topChannels.length)] : currentChannels[0];
    setHero(heroPick);
    
    currentCategoryMap = groupByCategory(currentChannels);
    renderCategories(currentCategoryMap);
  } else {
    container.innerHTML = '<div class="text-center text-red-500 text-xl py-20">Failed to load channels. Check console.</div>';
    heroTitle.innerText = 'Error loading.';
  }
}

// Navbar Scroll Effect
window.addEventListener('scroll', () => {
  const nav = document.getElementById('navbar');
  if (window.scrollY > 50) {
    nav.classList.add('bg-black/95', 'backdrop-blur-md', 'shadow-2xl', 'py-3');
    nav.classList.remove('bg-gradient-to-b', 'from-black/90', 'to-transparent', 'py-4');
  } else {
    nav.classList.add('bg-gradient-to-b', 'from-black/90', 'to-transparent', 'py-4');
    nav.classList.remove('bg-black/95', 'backdrop-blur-md', 'shadow-2xl', 'py-3');
  }
});

// Nav events
document.getElementById('nav-live').addEventListener('click', (e) => {
  e.preventDefault();
  document.querySelectorAll('.nav-links a').forEach(a => a.classList.remove('active'));
  e.target.classList.add('active');
  initApp('live');
});

document.getElementById('nav-movies').addEventListener('click', (e) => {
  e.preventDefault();
  document.querySelectorAll('.nav-links a').forEach(a => a.classList.remove('active'));
  e.target.classList.add('active');
  initApp('movies');
});

document.getElementById('hero-reload').addEventListener('click', () => {
  initApp(document.getElementById('nav-movies').classList.contains('active') ? 'movies' : 'live');
});

// Search functionality
document.getElementById('search-input').addEventListener('input', (e) => {
  const term = e.target.value.toLowerCase();
  if (!term) {
    renderCategories(currentCategoryMap);
    return;
  }
  
  const filtered = currentChannels.filter(c => c.name.toLowerCase().includes(term));
  renderCategories({'Search Results': filtered});
});

// Start
initApp('live');
