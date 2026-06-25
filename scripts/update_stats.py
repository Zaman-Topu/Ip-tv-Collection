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
README_FILE = "README.md"

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
                return 'active'
            elif resp.status in (403, 401, 451):
                return 'blocked'
            else:
                return 'down'
    except Exception:
        return 'down'

async def main():
    channel_entries = []
    seen_urls = set()
    current_extinf = None

    # Deduplicate and extract entries
    with open(M3U_FILE, 'r', encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            if line.startswith('#EXTINF'):
                current_extinf = line
            elif not line.startswith('#'):
                if line not in seen_urls:
                    seen_urls.add(line)
                    channel_entries.append({'extinf': current_extinf, 'url': line})
                current_extinf = None

    total = len(channel_entries)
    results = {'active': 0, 'blocked': 0, 'isp_bdix': 0, 'down': 0}
    url_status = {}

    print(f"Starting check for {total} channels...")

    sem = asyncio.Semaphore(SEMAPHORE_LIMIT)
    
    async def bound_check(url):
        async with sem:
            status = await check_url(session, url)
            results[status] += 1
            url_status[url] = status
            completed = sum(results.values())
            if completed % 1000 == 0 or completed == total:
                print(f"Progress: {completed}/{total} (Active: {results['active']}, Blocked: {results['blocked']}, BDIX: {results['isp_bdix']}, Down: {results['down']})")

    connector = aiohttp.TCPConnector(limit=SEMAPHORE_LIMIT, ssl=False)
    async with aiohttp.ClientSession(connector=connector) as session:
        tasks = [bound_check(entry['url']) for entry in channel_entries]
        await asyncio.gather(*tasks)

    # Filter channels and rewrite M3U files
    active_lines = ['#EXTM3U']
    complete_lines = ['#EXTM3U']
    
    for entry in channel_entries:
        url = entry['url']
        extinf = entry['extinf']
        status = url_status.get(url, 'down')
        
        # Build string blocks for the channel
        block = f"{extinf}\n{url}" if extinf else url
        
        if status != 'down':
            # Remove inactive streams completely from the master DB and add to active
            complete_lines.append(block)
            active_lines.append(block)
            
    # Overwrite the COMPLETE file (cleaning out dead streams)
    with open(M3U_FILE, 'w', encoding='utf-8') as f:
        f.write('\n'.join(complete_lines) + '\n')
        
    # Create the strictly ACTIVE file
    with open(ACTIVE_M3U_FILE, 'w', encoding='utf-8') as f:
        f.write('\n'.join(active_lines) + '\n')

    # Save to JSON for Web Player
    import json
    with open('channel_status.json', 'w', encoding='utf-8') as f:
        json.dump(url_status, f)

    active = results['active']
    blocked = results['blocked']
    isp_bdix = results['isp_bdix']
    down = results['down']

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
    # Fix for Windows asyncio loop if run locally
    import sys
    if sys.platform == 'win32':
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    asyncio.run(main())
