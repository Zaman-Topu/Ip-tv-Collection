# 📺 BUG TV — Ultimate Dynamic IPTV Aggregator & Web Client

<div align="center">
  <img src="https://raw.githubusercontent.com/Zaman-Topu/Ip-tv-Collection/main/assets/banner.png" alt="BUG TV banner" width="100%">
  
  <br><br>

  [![Channels](https://img.shields.io/badge/Channels-50k+-e20914?style=for-the-badge&logo=tv)](#)
  [![Live Status Check](https://img.shields.io/github/actions/workflow/status/Zaman-Topu/Ip-tv-Collection/daily-check.yml?branch=main&label=Live%20Checker&style=for-the-badge&logo=githubactions&logoColor=white)](https://github.com/Zaman-Topu/Ip-tv-Collection/actions/workflows/daily-check.yml)
  [![Deploy Web Player](https://img.shields.io/github/actions/workflow/status/Zaman-Topu/Ip-tv-Collection/deploy.yml?branch=main&label=Web%20Deploy&style=for-the-badge&logo=googlechrome&logoColor=white)](https://github.com/Zaman-Topu/Ip-tv-Collection/actions/workflows/deploy.yml)
  [![Android TV App](https://img.shields.io/badge/Android_TV_App-Download-ff0055?style=for-the-badge&logo=android)](https://github.com/Zaman-Topu/Ip-tv-Collection/releases/download/latest/app-release.apk)
  [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=for-the-badge)](LICENSE)
</div>

<br>

Welcome to **BUG TV**, the ultimate dynamic IPTV aggregator and smart client player. Every 48 hours, our automated GitHub Actions pipeline connects to **25+ of the top IPTV repositories**, merges streams, removes duplicates, checks link health, and publishes clean production-ready databases. 

We feature a **Premium Web Player** with a modern layout, allowing you to stream thousands of channels directly from your browser without installing any third-party IPTV apps!

---

## 📑 Table of Contents
- [🔗 Live Application Links](#-live-application-links)
- [📁 Repository Architecture & Directory Structure](#-repository-architecture--directory-structure)
- [✨ Features & Capabilities](#-features--capabilities)
- [⚡ Smart TV & Low-End Device Optimizations](#-smart-tv--low-end-device-optimizations)
- [📲 How to Use in Third-Party Apps](#-how-to-use-in-third-party-apps)
- [📡 Live Ingestion Status](#-live-ingestion-status)
- [📊 M3U Category Breakdown](#-m3u-category-breakdown)
- [🤝 Contributing & Issues](#-contributing--issues)
- [🛡️ Legal Disclaimer](#-legal-disclaimer)

---

## 🔗 Live Application Links
- **Web Player Client:** [https://zaman-topu.is-a.dev/Ip-tv-Collection/](https://zaman-topu.is-a.dev/Ip-tv-Collection/)
- **TV/Android Box APK:** [Download app-release.apk](https://github.com/Zaman-Topu/Ip-tv-Collection/releases/download/latest/app-release.apk)

---

## 📁 Repository Architecture & Directory Structure

```text
Ip-tv-Collection/
├── .github/
│   ├── ISSUE_TEMPLATE/       # Issue templates (broken stream + channel request)
│   │   ├── broken_stream.yml
│   │   └── channel_request.yml
│   ├── PULL_REQUEST_TEMPLATE.md
│   └── workflows/            # GitHub Actions pipelines
│       ├── auto-updater.yml  # Full source sync + merge every 2 days
│       ├── build-apk.yml     # Compiles Flutter Android TV app
│       ├── daily-check.yml   # Bi-daily live status check + README refresh
│       └── deploy.yml        # Builds & deploys Web Player to GitHub Pages
├── assets/                   # README visuals, banner, branding assets
├── bug_tv_app/               # Flutter Android TV application
├── scripts/                  # Python automation engines
│   ├── auto_updater.py       # Multi-source crawler + deduplication
│   ├── update_stats.py       # Live URL scanner + active/geo/dead split
│   ├── generate_epg.py       # Active playlist to epg.json mapper
│   └── epg_generator.py      # Full EPG XMLTV archive builder
├── web/                      # Web player (Vite + Video.js)
├── custom_playlist.m3u       # Protected custom channels (never overwritten)
├── FINAL_IPTV_ACTIVE.m3u     # Live + ISP/BDIX verified streams
├── FINAL_IPTV_GEO.m3u        # Geo-restricted but reachable streams
├── FINAL_IPTV_COMPLETE.m3u   # Master deduplicated live TV database
├── FINAL_IPTV_DEAD.m3u       # Dead / 404 / unreachable streams
├── FINAL_MOVIES_COMPLETE.m3u # Movies/VOD playlist output
├── channel_status.json       # Per-URL health state map for web client
├── epg.json                  # Program guide mapped to active channels
└── README.md                 # Project documentation
```

### 🔗 Quick Navigation (Key Folders & Files)
- **Automation Workflows**
  - [`auto-updater.yml`](.github/workflows/auto-updater.yml) — bi-daily full source sync and playlist regeneration
  - [`daily-check.yml`](.github/workflows/daily-check.yml) — bi-daily URL live check and stats update
- **Automation Scripts**
  - [`scripts/auto_updater.py`](scripts/auto_updater.py)
  - [`scripts/update_stats.py`](scripts/update_stats.py)
  - [`scripts/generate_epg.py`](scripts/generate_epg.py)
  - [`scripts/epg_generator.py`](scripts/epg_generator.py)
- **Delivery Clients**
  - [`web/`](web/) — browser player frontend
  - [`bug_tv_app/`](bug_tv_app/) — Flutter Android TV app

---

## ✨ Features & Capabilities

- **🚀 Premium Netflix-Style UI:** Beautiful glassmorphic filters, widescreen spotlight banners, horizontal rows with custom cinematic right-edge fading masks, and dynamic channel logo treatments.
- **🎮 Spatial TV Navigation:** Fully optimized for Smart TVs and Android TV Boxes. Easily navigate the entire interface using a TV Remote D-Pad (Arrow Keys + Enter).
- **🏷️ Automated Ingest & Checking:** Bi-daily bots crawl 25+ repos, check HTTP response codes, remove dead/404 links from the live database, and regenerate clean playlists.
- **🛡️ Custom Channel Protection:** Skip automatic crawler overwrites. Any channels added to [`custom_playlist.m3u`](custom_playlist.m3u) are preserved and shielded from deduplication filters.
- **📱 Responsive Layout:** Perfectly optimized for mobile phones (using floating capsule navigation bars), tablets, computers, and ultra-wide displays.

---

## ⚡ Smart TV & Low-End Device Optimizations

To ensure the player runs flawlessly on older devices and low-spec Smart TVs, we implemented the following performance fixes:
1. **Active Database by Default:** Loads the leaner `FINAL_IPTV_ACTIVE.m3u` database by default, reducing initial JSON/HTML memory consumption by **50%**.
2. **Offline Channel Pruning:** Automatically parses and discards all `dead` / `down` channels during database ingestion to prune the JS heap by **75%**.
3. **Failed Logo Cache:** Dynamically flags broken logo URLs to instantly render fallbacks, completely preventing continuous, CPU-heavy broken image network requests during scroll.
4. **Static Pill Filters:** Categorization pills are generated statically once. Switching categories toggles CSS classes rather than clearing/re-drawing 100+ DOM nodes, eliminating typing lag.
5. **No Blur Effects:** Replaced heavy CSS `backdrop-filter: blur(...)` elements with solid opacity backgrounds to minimize GPU repaint times.

---

## 📲 How to Use in Third-Party Apps
If you prefer standalone media players (like **TiviMate**, **IPTV Smarters Pro**, **Televizo**, or **VLC**), use our auto-updating playlist URLs:

### 🟢 1. Active Database (Recommended)
Contains 100% verified working streams and local BDIX links. Lightweight and ultra-fast.
```http
https://raw.githubusercontent.com/Zaman-Topu/Ip-tv-Collection/main/FINAL_IPTV_ACTIVE.m3u
```

### 🌍 2. Geo-Blocked Database
Streams that are online but require a VPN to bypass regional restrictions.
```http
https://raw.githubusercontent.com/Zaman-Topu/Ip-tv-Collection/main/FINAL_IPTV_GEO.m3u
```

### 📚 3. Complete Database
The massive, deduplicated master list containing everything (including untested streams).
```http
https://raw.githubusercontent.com/Zaman-Topu/Ip-tv-Collection/main/FINAL_IPTV_COMPLETE.m3u
```

### 📅 EPG (Electronic Program Guide)
Automated JSON program guide matched specifically to our Active Database:
```http
https://raw.githubusercontent.com/Zaman-Topu/Ip-tv-Collection/main/epg.json
```

---

## 📡 Live Ingestion Status

*This repository runs automated Python status checkers every 2 days to verify stream integrity and keep the live database clean.*

<!-- STATS:START -->
> **Last Checked:** 2026-09-20 02:23 AM (BST)
> *Next automated live scan runs every 2 days via GitHub Actions.*

| Status | Count | Percentage | Description |
| :--- | :---: | :---: | :--- |
| 🟢 **Active** | **9197** | 53.7% | Online and streaming globally. |
| 🔵 **Local ISP / BDIX** | **1659** | 9.7% | Local Bangladeshi ISP servers. Working perfectly if you are on that ISP. |
| 🟡 **Geo-Blocked** | **1623** | 9.5% | Stream is online but restricted to specific countries. |
| 🔴 **Down / Error** | **4659** | 27.2% | Server offline, timed out, or returning errors globally. |
| 📺 **Total Tested** | **17138** | 100% | Total channels in the playlist. |

<details>
<summary><b>Show Visual Chart 📊</b></summary>

```mermaid
pie title IPTV Channel Status Breakdown
    "Active (🟢)" : 9197
    "Local ISP/BDIX (🔵)" : 1659
    "Geo-Blocked (🟡)" : 1623
    "Down (🔴)" : 4659
```
</details>
<!-- STATS:END -->

---

## 📊 M3U Category Breakdown

| Category | Channel Count | Description |
| :--- | :---: | :--- |
| 🇧🇩 **[BD] Bangladesh** | 1,694 | All local Bangladeshi channels (BTV, Somoy, Jamuna, NTV, BDIX Servers) |
| 🗺️ **[COUNTRY] Countrywise** | 1,643 | Country-specific Live TV channels sorted globally |
| 🇮🇳 **[INDIA] India** | 7,222 | Hindi, Tamil, Telugu, Bengali & other regional Indian channels |
| ⚽ **[SPORTS] Sports** | 1,326 | T Sports, Star Sports, Sky, Bein, ESPN, F1, Live Cricket & Football Streams |
| 🌍 **[INTL-NEWS] News** | 1,338 | BBC, CNN, Al Jazeera, Sky News Live |
| 🎵 **[MUSIC] Music** | 1,084 | MTV, 9XM, Gaan Bangla, VH1 |
| 🧒 **[CARTOON] Kids** | 630 | Cartoon Network, Nick, Disney, Baby TV |
| 🎭 **[NATOK] Drama** | 240 | Star Jalsha, Zee Bangla, Colors Bangla, Natok streams |
| 🌐 **[ENGLISH] English**| 14,103 | General English entertainment, Lifestyle, TLC, History |
| 🕌 **[RELIGION] Religion** | 819 | Islamic, Quran, Peace TV, Madani, Christian, Hindu channels |
| 📚 **[DOC] Documentary** | 503 | Discovery, Nat Geo, Animal Planet |

---

## 🤝 Contributing & Issues

We welcome community contributions! Please check our [`CONTRIBUTING.md`](CONTRIBUTING.md) guide before opening Pull Requests or creating Issues.
- 🔴 **Report Broken Channel:** Use our [Broken Stream Issue Form](https://github.com/Zaman-Topu/Ip-tv-Collection/issues/new?template=broken_stream.yml)
- 📺 **Request New Channel:** Use our [Channel Request Form](https://github.com/Zaman-Topu/Ip-tv-Collection/issues/new?template=channel_request.yml)

---

## 🛡️ Legal Disclaimer
We do not host, stream, or control any of the channels provided in this repository. All streams are publicly available links collected from the internet. We do not endorse or take responsibility for the content. If you own the rights to any content and wish for it to be removed, please contact the original hosting provider or open an issue for removal.

Developed with ❤️ by [Zaman Topu (BUG MOHOL)](https://www.facebook.com/zamantopu.official/)
