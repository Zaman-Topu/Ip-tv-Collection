import asyncio
import aiohttp
import re
from datetime import datetime, timezone, timedelta
import socket
from urllib.parse import urlparse
import sys

# Windows select() loop is limited to 64 file descriptors; limit semaphore concurrency on Windows to 45
SEMAPHORE_LIMIT = 45 if sys.platform == 'win32' else 150

M3U_FILE = "FINAL_IPTV_COMPLETE.m3u"
ACTIVE_M3U_FILE = "FINAL_IPTV_ACTIVE.m3u"
GEO_M3U_FILE = "FINAL_IPTV_GEO.m3u"
DEAD_M3U_FILE = "FINAL_IPTV_DEAD.m3u"
README_FILE = "README.md"
CUSTOM_FILE = "custom_playlist.m3u"

SOURCE_URLS = [
    "https://raw.githubusercontent.com/abusaeeidx/Mrgify-BDIX-IPTV/main/playlist.m3u",
    "https://iptv-org.github.io/iptv/regions/amer.m3u",
    "https://iptv-org.github.io/iptv/regions/eur.m3u",
    "https://iptv-org.github.io/iptv/regions/asia.m3u",
    "https://iptv-org.github.io/iptv/regions/afr.m3u",
    "https://iptv-org.github.io/iptv/regions/oce.m3u",
    "https://iptv-org.github.io/iptv/countries/us.m3u",
    "https://iptv-org.github.io/iptv/countries/de.m3u",
    "https://iptv-org.github.io/iptv/countries/fr.m3u",
    "https://iptv-org.github.io/iptv/countries/ca.m3u",
    "https://iptv-org.github.io/iptv/countries/es.m3u",
    "https://iptv-org.github.io/iptv/countries/it.m3u",
    "https://iptv-org.github.io/iptv/countries/br.m3u",
    "https://raw.githubusercontent.com/Monjil404/livetv/refs/heads/main/pro",
    "https://raw.githubusercontent.com/Monjil404/TVspo/refs/heads/main/tvs",
    "https://raw.githubusercontent.com/ashik4u/mrgify-clean/main/playlist.m3u",
    "https://raw.githubusercontent.com/imShakil/tvlink/refs/heads/main/iptv.m3u8",
    "https://raw.githubusercontent.com/tvbd/m3uplayer/refs/heads/main/m3u/xniptv.m3u",
    "https://raw.githubusercontent.com/time2shine/IPTV/master/combined.m3u",
    "https://raw.githubusercontent.com/ShamimHossainOfficial/IPTV/master/BDIX-IPTV.m3u8",
    "https://raw.githubusercontent.com/Shadmanislam/bdiptv/master/BD%20IPTV.m3u",
    "https://raw.githubusercontent.com/DrSujonPaul/Sujon/6dc6a1d4eaa20a9239ae27d8e0f00182b60eeb47/iptv",
    "https://raw.githubusercontent.com/srhady/Hady/refs/heads/main/akash_live.m3u",
    "https://raw.githubusercontent.com/bugsfreeweb/LiveTVCollector/main/LiveTV/Bangladesh/LiveTV.m3u",
    "https://raw.githubusercontent.com/bugsfreeweb/LiveTVCollector/main/LiveTV/India/LiveTV.m3u",
    "https://lupael.github.io/IPTV/running.m3u",
    "https://raw.githubusercontent.com/srhady/axsports/refs/heads/main/playlist.m3u"
]

# Keywords and regex for local Bangladeshi ISP / BDIX streams
BDIX_KEYWORDS = ['bdix', 'samonline', 'amberit', 'link3', 'carnival', 'dotinternet', 'ksnetwork', 'dfn', 'optimax', 'circleftp', 'ftp.']

def is_local_isp_stream(url):
    try:
        parsed = urlparse(url)
        host = parsed.hostname
        if not host: return False
        
        # Check if hostname contains BDIX keywords
        if any(kw in host.lower() for kw in BDIX_KEYWORDS):
            return True
            
        # Check if it's a private IP address
        if re.match(r'^(10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[0-1])\.)', host):
            return True
    except:
        pass
    return False

async def check_url(session, url):
    if is_local_isp_stream(url):
        return 'isp_bdix'
        
    try:
        headers = {'Range': 'bytes=0-100', 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'}
        async with session.get(url, headers=headers, timeout=8, allow_redirects=True) as resp:
            if resp.status in (200, 206, 302, 301):
                ctype = resp.headers.get('Content-Type', '').lower()
                if 'text/html' in ctype:
                    return 'blocked'
                return 'active'
            elif resp.status in (403, 401, 451):
                return 'blocked'
            else:
                return 'down'
    except Exception:
        return 'down'

async def fetch_playlist(session, url):
    try:
        async with session.get(url, timeout=15) as resp:
            if resp.status == 200:
                text = await resp.text()
                return text
    except Exception as e:
        print(f"Failed to fetch {url}: {e}")
    return ""

async def main():
    channel_entries = []
    seen_urls = set()

    connector = aiohttp.TCPConnector(limit=SEMAPHORE_LIMIT, ssl=False)
    async with aiohttp.ClientSession(connector=connector) as session:
        print("Fetching latest playlists from sources...")
        tasks = [fetch_playlist(session, url) for url in SOURCE_URLS]
        results = await asyncio.gather(*tasks)

        print("Loading custom playlist to prioritize working links...")
        custom_names = set()
        import os
        if os.path.exists(CUSTOM_FILE):
            with open(CUSTOM_FILE, 'r', encoding='utf-8') as f:
                lines = f.readlines()
                c_extinf = None
                for line in lines:
                    line = line.strip()
                    if not line: continue
                    if line.startswith('#EXTINF'):
                        c_extinf = line
                    elif not line.startswith('#'):
                        if line not in seen_urls:
                            seen_urls.add(line)
                            channel_entries.append({'extinf': c_extinf, 'url': line})
                            # Extract base name to protect it
                            import re
                            name_match = re.search(r',([^,]+)$', c_extinf) if c_extinf else None
                            if name_match:
                                base_name = re.sub(r'\(.*?\)', '', name_match.group(1)).strip().lower()
                                custom_names.add(base_name)
                        c_extinf = None
        print(f"Loaded {len(custom_names)} custom channels to protect from overwriting.")

        print("Merging and deduplicating scraped playlists...")
        for text in results:
            if not text: continue
            current_extinf = None
            for line in text.splitlines():
                line = line.strip()
                if not line:
                    continue
                if line.startswith('#EXTINF'):
                    current_extinf = line
                elif not line.startswith('#'):
                    if line not in seen_urls:
                        # Only add if we don't already have a custom working version of this channel
                        import re
                        name_match = re.search(r',([^,]+)$', current_extinf) if current_extinf else None
                        base_name = ""
                        if name_match:
                            base_name = re.sub(r'\(.*?\)', '', name_match.group(1)).strip().lower()
                        
                        if base_name not in custom_names:
                            seen_urls.add(line)
                            channel_entries.append({'extinf': current_extinf, 'url': line})
                    current_extinf = None

        print(f"Deduplicated total: {len(channel_entries)} unique channels.")

        total = len(channel_entries)
        stats = {'active': 0, 'blocked': 0, 'isp_bdix': 0, 'down': 0}
        url_status = {}

        print(f"Starting check for {total} channels...")
        sem = asyncio.Semaphore(SEMAPHORE_LIMIT)
        
        async def bound_check(url):
            async with sem:
                status = await check_url(session, url)
                stats[status] += 1
                url_status[url] = status
                completed = sum(stats.values())
                if completed % 1000 == 0 or completed == total:
                    print(f"Progress: {completed}/{total} (Active: {stats['active']}, Blocked: {stats['blocked']}, BDIX: {stats['isp_bdix']}, Down: {stats['down']})")

        tasks = [bound_check(entry['url']) for entry in channel_entries]
        await asyncio.gather(*tasks)

    # Filter channels and rewrite M3U files
    active_lines = ['#EXTM3U']
    geo_lines = ['#EXTM3U']
    dead_lines = ['#EXTM3U']
    complete_lines = ['#EXTM3U']
    
    for entry in channel_entries:
        url = entry['url']
        extinf = entry['extinf']
        status = url_status.get(url, 'down')
        
        # Build string blocks for the channel
        block = f"{extinf}\n{url}" if extinf else url
        
        if status in ['active', 'isp_bdix']:
            active_lines.append(block)
        elif status == 'blocked':
            geo_lines.append(block)
        elif status == 'down':
            dead_lines.append(block)
            
        complete_lines.append(block)
            
    # Overwrite the files
    with open(ACTIVE_M3U_FILE, 'w', encoding='utf-8') as f:
        f.write('\n'.join(active_lines) + '\n')
    with open(GEO_M3U_FILE, 'w', encoding='utf-8') as f:
        f.write('\n'.join(geo_lines) + '\n')
    with open(DEAD_M3U_FILE, 'w', encoding='utf-8') as f:
        f.write('\n'.join(dead_lines) + '\n')
    with open(M3U_FILE, 'w', encoding='utf-8') as f:
        f.write('\n'.join(complete_lines) + '\n')

    # Save to JSON for Web Player
    import json
    with open('channel_status.json', 'w', encoding='utf-8') as f:
        json.dump(url_status, f)

    active = stats['active']
    blocked = stats['blocked']
    isp_bdix = stats['isp_bdix']
    down = stats['down']

    p_active = (active / total * 100) if total > 0 else 0
    p_blocked = (blocked / total * 100) if total > 0 else 0
    p_isp = (isp_bdix / total * 100) if total > 0 else 0
    p_down = (down / total * 100) if total > 0 else 0

    bst_time = datetime.now(timezone(timedelta(hours=6))).strftime("%Y-%m-%d %I:%M %p (BST)")

    stats_md = f"""
> **Last Checked:** {bst_time}
> *Next check scheduled for 12:00 AM tonight.*

| Status | Count | Percentage | Description |
| :--- | :---: | :---: | :--- |
| 🟢 **Active** | **{active}** | {p_active:.1f}% | Online and streaming globally. |
| 🔵 **Local ISP / BDIX** | **{isp_bdix}** | {p_isp:.1f}% | Local Bangladeshi ISP servers. Working perfectly if you are on that ISP. |
| 🟡 **Geo-Blocked** | **{blocked}** | {p_blocked:.1f}% | Stream is online but restricted to specific countries. |
| 🔴 **Down / Error** | **{down}** | {p_down:.1f}% | Server offline, timed out, or returning errors globally. |
| 📺 **Total Tested** | **{total}** | 100% | Total channels in the playlist. |

<details>
<summary><b>Show Visual Chart 📊</b></summary>

```mermaid
pie title IPTV Channel Status Breakdown
    "Active (🟢)" : {active}
    "Local ISP/BDIX (🔵)" : {isp_bdix}
    "Geo-Blocked (🟡)" : {blocked}
    "Down (🔴)" : {down}
```
</details>
"""

    print("Updating README.md...")
    with open(README_FILE, 'r', encoding='utf-8') as f:
        content = f.read()

    new_content = re.sub(
        r'<!-- STATS:START -->.*<!-- STATS:END -->',
        f'<!-- STATS:START -->\n{stats_md.strip()}\n<!-- STATS:END -->',
        content,
        flags=re.DOTALL
    )

    with open(README_FILE, 'w', encoding='utf-8') as f:
        f.write(new_content)
    print("Done!")

if __name__ == "__main__":
    import sys
    asyncio.run(main())
