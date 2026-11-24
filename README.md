# Tilawa

Quran recitation for [Orca](https://orca.dev) (تلاوة): listen while your agents work.

## What it does

- **Reciters:** about 240 reciters and 300 recitation styles (Hafs, Warsh, Qalon and more), streamed from the free [mp3quran.net](https://mp3quran.net) API. Tilawa does not host or re-distribute any audio.
- **My files:** point it at a folder of your own recitations. Files are matched by surah number or name, and the rest of the name is the reciter, for example `002 Al-Baqarah Husary.mp3`, `Husary/36.mp3` or `Sudais - Yasin.mp3`. They join the matching online reciter, so there is one profile per person. Inside it, filter by **All / My files / Online** and pick a recitation style. A name that fits more than one reciter is left as its own profile rather than guessed.
- **Follow agents (optional):** in Settings, switch from Manual to Follow agents. It starts when an agent starts working, pauses when one needs you (blocked or waiting), and stops a while after they finish. The start and keep-playing delays stop short agent runs from restarting it every time. Music you start yourself is never stopped by it.
- **Favorites, playlists, offline:** star reciters, heart recitations, build playlists across reciters, and save surahs for offline listening. Saving streams the mp3 to disk in the background; removing it deletes the file.
- **Keeps playing:** playback lives in the plugin's worker, so closing the panel does not stop it. The status bar item plays and pauses.
- **Reciter photos:** matched automatically from Wikipedia (English and Arabic names) where a free photo exists; otherwise a geometric medallion is shown. A photo is only accepted when the page is about a Quran reciter and its name has the same words as the reciter's. Photos cannot be changed from inside the plugin.

## Install for development

```sh
orca plugin validate .
orca plugin dev load . --approve <fingerprint>   # `dev load .` prints the fingerprint and what it grants
node names.test.mjs                              # name-matching checks
```

## Access it asks for

| Access | Why |
| --- | --- |
| Full worker (`trusted-worker`) | Runs a small PowerShell helper that plays audio, fetches the catalog, audio and photos over the network, and reads the folder you choose. |
| `agent:read` | Follow mode listens to agent status changes. |
| `storage:own` | Saves favorites, playlists, settings and the offline list. |

## Network use

The worker talks to `mp3quran.net` (catalog and audio) and `en.wikipedia.org` / `ar.wikipedia.org` (reciter photos). It sends no analytics or personal data and uses a generic user agent. Photo lookups run one at a time and back off when throttled. Audio reaches the Windows media engine through a loopback relay on `127.0.0.1` (secret path, mp3quran hosts only), because that engine cannot open `https://` itself.

Cached data (catalog, photos, saved surahs) lives in `%LOCALAPPDATA%\orca-tilawa`.

## Platform

Windows only for now: playback uses the Windows media engine through PowerShell. macOS and Linux would need another player behind the same `load / pause / resume / seek / vol` helper protocol (`player.ps1`).

## Files

| File | Role |
| --- | --- |
| `worker.mjs` | Playback, catalog, local-file merge, photos, favorites, playlists, downloads, agent following. |
| `names.mjs` | The one name matcher used for merging folders and accepting photos (`names.test.mjs` checks it). |
| `panel.html`, `panel.js`, `panel.css` | The panel UI, a remote control for the worker. |
| `player.ps1` | The audio helper process. |
| `surahs.json` | Surah names in English and Arabic. |

## Credits

- Audio and reciter list: [mp3quran.net](https://mp3quran.net). Each recitation belongs to its reciter and publisher.
- Photos: Wikipedia and Wikimedia Commons, under their respective licenses. The page each photo came from is saved next to it in the cache.
- Fonts: [Figtree](https://github.com/erikdkennedy/figtree) and [Amiri](https://github.com/aliftype/amiri), both under the SIL Open Font License.

## License

MIT
