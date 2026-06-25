import urllib.request
import gzip
import xml.etree.ElementTree as ET
import json
import os
import datetime

EPG_URL = "https://epgshare01.online/epgshare01/epg_ripper_ALL_SOURCES1.xml.gz"
M3U_FILE = "FINAL_IPTV_ACTIVE.m3u"
OUT_JSON = "epg.json"

def get_channel_ids():
    ids = set()
    names = {}
    if not os.path.exists(M3U_FILE):
        return ids, names
        
    with open(M3U_FILE, 'r', encoding='utf-8') as f:
        for line in f:
            if line.startswith('#EXTINF'):
                # Extract tvg-id or use channel name
                tvg_id = ""
                if 'tvg-id="' in line:
                    parts = line.split('tvg-id="')
                    if len(parts) > 1:
                        tvg_id = parts[1].split('"')[0]
                
                name_part = line.split(',')[-1].strip()
                if tvg_id:
                    ids.add(tvg_id)
                names[name_part.lower()] = tvg_id if tvg_id else name_part
    return ids, names

def main():
    print("Extracting target channel IDs from Active M3U...")
    target_ids, target_names = get_channel_ids()
    print(f"Found {len(target_ids)} channels with tvg-id and {len(target_names)} total channels.")

    if not target_ids and not target_names:
        print("No channels found. Exiting.")
        return

    epg_data = {}
    
    # Download and parse XML iteratively to save RAM
    print(f"Downloading EPG from {EPG_URL}...")
    req = urllib.request.Request(EPG_URL, headers={'User-Agent': 'Mozilla/5.0'})
    
    try:
        with urllib.request.urlopen(req) as response:
            with gzip.open(response, 'rt', encoding='utf-8') as f:
                print("Parsing XMLTV...")
                context = ET.iterparse(f, events=('end',))
                
                # Precompute current time (we only want 'now playing' and 'next')
                now = datetime.datetime.utcnow()
                
                for event, elem in context:
                    if elem.tag == 'programme':
                        channel_id = elem.get('channel')
                        
                        if channel_id in target_ids:
                            start_str = elem.get('start') # Format: 20231024080000 +0000
                            stop_str = elem.get('stop')
                            
                            if start_str and stop_str:
                                try:
                                    start_dt = datetime.datetime.strptime(start_str[:14], '%Y%m%d%H%M%S')
                                    stop_dt = datetime.datetime.strptime(stop_str[:14], '%Y%m%d%H%M%S')
                                    
                                    # If the program is currently running or within the next 4 hours
                                    if start_dt <= now <= stop_dt or (now <= start_dt <= now + datetime.timedelta(hours=4)):
                                        title_elem = elem.find('title')
                                        desc_elem = elem.find('desc')
                                        
                                        title = title_elem.text if title_elem is not None else "Unknown Program"
                                        desc = desc_elem.text if desc_elem is not None else ""
                                        
                                        if channel_id not in epg_data:
                                            epg_data[channel_id] = []
                                            
                                        epg_data[channel_id].append({
                                            'title': title,
                                            'desc': desc,
                                            'start': start_str[:14],
                                            'stop': stop_str[:14]
                                        })
                                except Exception as e:
                                    pass
                        elem.clear() # Free memory
    except Exception as e:
        print(f"Failed to fetch or parse EPG: {e}")
        
    print(f"Matched EPG data for {len(epg_data)} channels.")
    
    with open(OUT_JSON, 'w', encoding='utf-8') as f:
        json.dump(epg_data, f)
    print("Saved epg.json.")

if __name__ == "__main__":
    main()
