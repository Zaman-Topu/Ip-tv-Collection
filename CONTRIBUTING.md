# 🤝 Contributing to BUG TV (Ip-tv-Collection)

Thank you for your interest in contributing to **BUG TV**! We welcome contributions to clean IPTV playlists, report dead streams, improve the Web Player, or update the Flutter Android TV app.

---

## 🛠️ How You Can Contribute

### 1. 📺 Adding or Updating Custom Channels
If you want to add working IPTV streams or local BDIX channels:
- Add your channels directly to [`custom_playlist.m3u`](custom_playlist.m3u).
- Channels added to `custom_playlist.m3u` are **protected** and will never be overwritten or deleted by automated daily crawler scripts.

### 2. 🐛 Reporting Dead Streams & Issues
If a channel is offline or broken:
- Open an [Issue](https://github.com/Zaman-Topu/Ip-tv-Collection/issues) using the **Broken Stream Report** template.
- Provide the channel name, category, and error message.

### 3. 💻 Web Player & Flutter App Improvements
- **Web Player:** Located in the [`web/`](web/) folder (built with Vite & Video.js).
- **Android App:** Located in the [`bug_tv_app/`](bug_tv_app/) folder (built with Flutter).
- Fork the repository, make your changes, and submit a **Pull Request (PR)** targeting the `main` branch.

---

## 📜 Pull Request Guidelines
1. Ensure your code builds cleanly without errors (`npm run build` for Web or `flutter build apk` for App).
2. Keep PR descriptions clear and explain the motivation behind changes.
3. Respect legal standards: Do **not** submit malicious, spam, or abusive links.

Thank you for helping keep BUG TV alive and updated! ❤️
