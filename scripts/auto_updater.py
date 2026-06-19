import asyncio
import aiohttp
import re
import os
import urllib.parse

OUTPUT_FILE = "FINAL_IPTV_COMPLETE.m3u"
MOVIES_OUTPUT_FILE = "FINAL_MOVIES_COMPLETE.m3u"

SOURCES = [
    "https://raw.githubusercontent.com/Monjil404/livetv/refs/heads/main/pro",
    "https://raw.githubusercontent.com/Monjil404/TVspo/refs/heads/main/tvs",
    "https://raw.githubusercontent.com/abusaeeidx/Mrgify-BDIX-IPTV/main/playlist.m3u",
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

GROUP_MAP = {
    # Indian Bangla
    "indian bangla": "Indian Bangla", "kolkata": "Indian Bangla", "zee bangla": "Indian Bangla",
    "star jalsha": "Indian Bangla", "colors bangla": "Indian Bangla", "sony aath": "Indian Bangla",
    
    # Bangladesh
    "bangladesh": "Bangladesh", "bangla": "Bangladesh", "bd channel": "Bangladesh",
    "bd tv": "Bangladesh", "bdix": "Bangladesh", "bd live": "Bangladesh",
    
    # News BD
    "news bd": "News BD", "bd news": "News BD", "news bangla": "News BD", "bangla news": "News BD",
    
    # International News
    "news": "International News", "intl news": "International News", "world news": "International News",
    "international news": "International News",
    
    # Sports
    "sport": "Sports", "cricket": "Sports", "football": "Sports", "soccer": "Sports",
    "racing": "Sports", "tennis": "Sports", "golf": "Sports", "boxing": "Sports",
    "wrestling": "Sports", "formula": "Sports", "olympic": "Sports", "esport": "Sports", "fitness": "Sports",
    
    # Movies
    "movie": "Movies", "cinema": "Movies", "film": "Movies", "films": "Movies", "movies": "Movies", "cine": "Movies",
    
    # Natok & Drama
    "natok": "Natok & Drama", "drama": "Natok & Drama", "series": "Natok & Drama",
    "serial": "Natok & Drama", "entertainment": "Natok & Drama",
    
    # Cartoon & Kids
    "cartoon": "Cartoon & Kids", "kids": "Cartoon & Kids", "children": "Cartoon & Kids",
    "junior": "Cartoon & Kids", "anime": "Cartoon & Kids", "animation": "Cartoon & Kids", "baby": "Cartoon & Kids",
    
    # Religion
    "islamic": "Religion", "islam": "Religion", "quran": "Religion", "religious": "Religion",
    "religion": "Religion", "muslim": "Religion", "christian": "Religion", "church": "Religion",
    "hindu": "Religion", "peace": "Religion", "madani": "Religion",
    
    # Music
    "music": "Music", "song": "Music", "audio": "Music", "radio": "Music", "mtv": "Music",
    
    # Documentary
    "documentary": "Documentary", "discovery": "Documentary", "history": "Documentary",
    "science": "Documentary", "animal": "Documentary", "nature": "Documentary", "wild": "Documentary",
    
    # English
    "english": "English", "uk": "English", "usa": "English",
    
    # India (Hindi/Others)
    "india": "India", "hindi": "India", "telugu": "India", "tamil": "India",
    "kannada": "India", "malayalam": "India", "punjabi": "India", "marathi": "India",
    "bengali": "India", "kolkata": "India"
}

def map_category(raw_group, channel_name):
    raw_group_lower = (raw_group or "").lower().strip()
    name_lower = (channel_name or "").lower().strip()
    
    # Priority 1: Match source group
    for kw, cat in GROUP_MAP.items():
        if kw in raw_group_lower:
            # Special strictness for movies
            if cat == "Movies" and kw not in ["movie", "cinema", "film", "films", "movies", "cine"]:
                continue
            return cat
            
    # Priority 2: Match channel name
    for kw, cat in GROUP_MAP.items():
        if kw in name_lower:
            if cat == "Movies": continue
            return cat
            
    # Priority 3: Default fallbacks
    if raw_group_lower:
        return "Countrywise"
    return "Others"

async def fetch_playlist(session, url):
    try:
        async with session.get(url, timeout=30) as resp:
            if resp.status == 200:
                text = await resp.text()
                print(f"[OK] Fetched {url} ({len(text)} chars)")
                return text
            else:
                print(f"[ERR] {url} returned {resp.status}")
                return ""
    except Exception as e:
        print(f"[FAIL] {url} - {str(e)}")
        return ""

async def main():
    print("Starting Auto-Updater...")
    connector = aiohttp.TCPConnector(limit=10, ssl=False)
    async with aiohttp.ClientSession(connector=connector) as session:
        tasks = [fetch_playlist(session, url) for url in SOURCES]
        playlists = await asyncio.gather(*tasks)
        
        # Fetch public JSON channels
        scraped_json = ""
        try:
            print("[SCRAPER] Fetching channels from http://198.195.239.50/tv_channels.json...")
            async with session.get("http://198.195.239.50/tv_channels.json", timeout=15) as resp:
                if resp.status == 200:
                    scraped_json = await resp.text()
                    print(f"[SCRAPER] Success! Fetched {len(scraped_json)} chars")
                else:
                    print(f"[SCRAPER] ERR! Returned status {resp.status}")
        except Exception as e:
            print("[SCRAPER] FAIL! Error:", e)

    print("Parsing playlists and extracting metadata...")
    
    channels = {} # url -> dict of metadata
    
    for content in playlists:
        lines = content.splitlines()
        current_extinf = None
        
        for line in lines:
            line = line.strip()
            if not line: continue
            
            if line.startswith("#EXTINF:"):
                current_extinf = line
            elif line.startswith("http"):
                url = line
                if current_extinf:
                    # Parse EXTINF
                    # Example: #EXTINF:-1 tvg-logo="http..." group-title="BD",Channel Name
                    
                    # Extract logo
                    logo_match = re.search(r'tvg-logo="([^"]+)"', current_extinf)
                    logo = logo_match.group(1) if logo_match else ""
                    
                    # Extract group
                    group_match = re.search(r'group-title="([^"]+)"', current_extinf)
                    group = group_match.group(1) if group_match else ""
                    
                    # Extract name (everything after the last comma)
                    name_split = current_extinf.split(',')
                    name = name_split[-1].strip() if len(name_split) > 1 else "Unknown Channel"
                    
                    # Store or update in dictionary
                    if url not in channels:
                        channels[url] = {'name': name, 'group': group, 'logo': logo}
                    else:
                        # Prioritize keeping an entry if the new one has a logo, or if current doesn't have one
                        if logo and not channels[url]['logo']:
                            channels[url]['logo'] = logo
                            channels[url]['name'] = name
                            channels[url]['group'] = group
                current_extinf = None

    # Merge scraped JSON channels professionally
    if scraped_json:
        try:
            import json
            data = json.loads(scraped_json)
            scraped_count = 0
            for ch in data.get("channels", []):
                if ch.get("status") == "hidden":
                    continue
                url = ch.get("url")
                if not url:
                    continue
                name = ch.get("name", "Unknown Channel")
                
                # Resolve relative logo
                logo = ch.get("logo", "")
                if logo and not logo.startswith("http"):
                    logo = "http://198.195.239.50/" + logo.replace(" ", "%20")
                
                # Use category as raw group
                group = ch.get("category", "")
                
                # Add/overwrite in channels, prioritizing this source because it's high quality and public IP
                channels[url] = {'name': name, 'group': group, 'logo': logo}
                scraped_count += 1
            print(f"[SCRAPER] Merged {scraped_count} public channels from http://198.195.239.50/ successfully!")
        except Exception as e:
            print("[SCRAPER] Error merging JSON channels:", e)

    print(f"Total unique channels found: {len(channels)}")
    print("Categorizing and writing to files...")
    
    with open(OUTPUT_FILE, 'w', encoding='utf-8') as f_tv, open(MOVIES_OUTPUT_FILE, 'w', encoding='utf-8') as f_mov:
        f_tv.write("#EXTM3U\n")
        f_mov.write("#EXTM3U\n")
        
        for url, data in channels.items():
            mapped_cat = map_category(data['group'], data['name'])
            
            # Format logo tag if it exists
            logo_attr = f' tvg-logo="{data["logo"]}"' if data["logo"] else ""
            
            entry = f'#EXTINF:-1 group-title="{mapped_cat}"{logo_attr},{data["name"]}\n{url}\n'
            
            if mapped_cat == "Movies":
                f_mov.write(entry)
            else:
                f_tv.write(entry)
            
    print(f"Success! Written Live TV to {OUTPUT_FILE} and Movies to {MOVIES_OUTPUT_FILE}")

if __name__ == "__main__":
    import sys
    if sys.platform == 'win32':
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    asyncio.run(main())
