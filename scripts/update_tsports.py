import os
import re

m3u_path = r"g:\final iptv collection\Ip-tv-Collection\FINAL_IPTV_COMPLETE.m3u"

if not os.path.exists(m3u_path):
    print(f"Error: File not found at {m3u_path}")
    exit(1)

with open(m3u_path, "r", encoding="utf-8", errors="ignore") as f:
    lines = f.readlines()

print(f"Total lines in M3U: {len(lines)}")

# Parse channels
new_lines = []
if lines:
    new_lines.append(lines[0]) # Keep #EXTM3U header

i = 1
removed_count = 0
tsports_logo = ""

while i < len(lines):
    line = lines[i].strip()
    if not line:
        i += 1
        continue
    
    if line.startswith("#EXTINF:"):
        # This is an info line, get the next line (URL)
        next_i = i + 1
        while next_i < len(lines) and not lines[next_i].strip():
            next_i += 1
            
        if next_i < len(lines):
            url_line = lines[next_i].strip()
            
            # Check if this channel is a T Sports channel
            is_tsports = False
            if "tsports" in line.lower() or "t sports" in line.lower() or "t-sports" in line.lower():
                is_tsports = True
            if "tsports" in url_line.lower() or "t sports" in url_line.lower() or "t-sports" in url_line.lower():
                is_tsports = True
                
            if is_tsports:
                # Keep our public stream and local BDIX stream
                if "198.195.239.50" in url_line or "172.19.17.4" in url_line:
                    # Rename the BDIX one to make it clear
                    if "172.19.17.4" in url_line:
                        line = re.sub(r',T Sports.*$', ',T Sports (BDIX)', line)
                    new_lines.append(line + "\n")
                    new_lines.append(url_line + "\n")
                else:
                    removed_count += 1
                    # Try to extract the logo URL if present
                    logo_match = re.search(r'tvg-logo="([^"]+)"', line)
                    if logo_match and not tsports_logo:
                        tsports_logo = logo_match.group(1)
                i = next_i + 1
                continue
            else:
                new_lines.append(lines[i])
                new_lines.append(lines[next_i])
                i = next_i + 1
                continue
        else:
            new_lines.append(lines[i])
            i += 1
    else:
        new_lines.append(lines[i])
        i += 1

print(f"Removed {removed_count} T Sports channels.")
if not tsports_logo:
    tsports_logo = "https://raw.githubusercontent.com/Zaman-Topu/Ip-tv-Collection/main/assets/tsports.png" # Fallback

print(f"Using T Sports logo: {tsports_logo}")

# Add the local BDIX T Sports channel if not already there
bdix_exists = any("172.19.17.4" in line for line in new_lines)
if not bdix_exists:
    new_lines.append(f'#EXTINF:-1 tvg-logo="{tsports_logo}" group-title="Sports",T Sports (BDIX)\n')
    new_lines.append("http://172.19.17.4:8090/hls/tsportshd3rd.m3u8\n")

# Write back
with open(m3u_path, "w", encoding="utf-8") as f:
    f.writelines(new_lines)

print("M3U updated successfully!")
