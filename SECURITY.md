# Security Policy

## Supported Versions

The IPTV aggregator and Web Player are actively maintained.

| Component | Supported          |
| ------- | ------------------ |
| GitHub Action Backend | :white_check_mark: |
| Web Player | :white_check_mark: |

## Reporting a Vulnerability

We take the security of this open-source project seriously. Because this project aggregates public M3U links, there are a few inherent risks that we mitigate through our GitHub Actions testing pipeline:

1. **Malicious Links:** If you discover that an aggregated link points to a malicious domain or executes unwanted code, please report it immediately.
2. **Web Player XSS:** If you find a Cross-Site Scripting (XSS) vulnerability in the Web Player's M3U parser or EPG renderer, let us know.

### How to Report
Please **DO NOT** create a public GitHub issue for security vulnerabilities. Instead, please email the repository owner or send a direct message via the appropriate channels.

### Takedown Requests (DMCA)
This repository does NOT host any media files, video streams, or copyrighted content. It simply aggregates publicly available hyperlinks. 

If you are a copyright owner and believe a link should be removed from the aggregator, please open an Issue with the exact URL and we will add it to the backend blocklist.
