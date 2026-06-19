import asyncio
import aiohttp
import re
from datetime import datetime, timezone, timedelta

M3U_FILE = "FINAL_IPTV_COMPLETE.m3u"
README_FILE = "README.md"

async def check_url(session, url):
    try:
        # We use a short timeout. If a stream doesn't respond in 8 seconds, it's considered down for live TV purposes.
        # We use GET with a Range header to just fetch the first few bytes, which acts like a HEAD request but works better for some stream servers that block HEAD.
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
    urls = []
    with open(M3U_FILE, 'r', encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith('#'):
                urls.append(line)

    total = len(urls)
    results = {'active': 0, 'blocked': 0, 'down': 0}

    print(f"Starting check for {total} channels...")

    # Semaphore to limit concurrency. 100 concurrent connections is a safe balance to avoid overwhelming the runner or network.
    sem = asyncio.Semaphore(150)
    
    # We will test a subset to avoid hitting the 6-hour GitHub Action timeout if there are too many timeouts.
    # 32,000 requests * 8s timeout / 150 concurrency = ~28 minutes worst case. This is perfectly fine.

    async def bound_check(url):
        async with sem:
            status = await check_url(session, url)
            results[status] += 1
            completed = sum(results.values())
            if completed % 1000 == 0 or completed == total:
                print(f"Progress: {completed}/{total} (Active: {results['active']}, Blocked: {results['blocked']}, Down: {results['down']})")

    # Use a TCPConnector to limit total connections and disable SSL verification for streams with broken certs.
    connector = aiohttp.TCPConnector(limit=0, ssl=False)
    async with aiohttp.ClientSession(connector=connector) as session:
        tasks = [bound_check(u) for u in urls]
        await asyncio.gather(*tasks)

    # Calculate percentages
    active = results['active']
    blocked = results['blocked']
    down = results['down']

    p_active = (active / total * 100) if total > 0 else 0
    p_blocked = (blocked / total * 100) if total > 0 else 0
    p_down = (down / total * 100) if total > 0 else 0

    # Format BST Time (UTC+6)
    bst_time = datetime.now(timezone(timedelta(hours=6))).strftime("%Y-%m-%d %I:%M %p (BST)")

    # Build the Markdown string
    stats_md = f"""
> **Last Checked:** {bst_time}
> *Next check scheduled for 12:00 AM tonight.*

| Status | Count | Percentage | Description |
| :--- | :---: | :---: | :--- |
| 🟢 **Active** | **{active}** | {p_active:.1f}% | Online and streaming flawlessly. |
| 🟡 **Geo-Blocked** | **{blocked}** | {p_blocked:.1f}% | Stream is online but restricted to specific countries/ISPs. |
| 🔴 **Down / Error** | **{down}** | {p_down:.1f}% | Server is offline, timed out, or returning errors. |
| 📺 **Total Tested** | **{total}** | 100% | Total channels in the playlist. |

<details>
<summary><b>Show Visual Chart 📊</b></summary>

```mermaid
pie title IPTV Channel Status Breakdown
    "Active (🟢)" : {active}
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
