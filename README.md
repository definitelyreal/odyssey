# THE ODYSSEY — a jukebox · v1.0

Seven records, seven artists, one title, about twenty minutes. Live at
https://odyssey.definitelyreal.com

## Run it

No build step. Either:

- Open `index.html` directly in a browser (it uses an inline data snapshot when opened as a
  file), or
- Serve the folder: `python3 -m http.server 8471` and open http://localhost:8471 (served mode
  reads `data/records.json` live).

QA hook: append `#now` to the URL to start the memorial even in a hidden tab and hold it for
60 seconds instead of auto-advancing.

## Files

| File | What it is |
|---|---|
| `index.html` | The page, OG/share tags, memorial markup, inline mirror of the record data |
| `styles.css` | All styling; the wear gradient runs on `--wear`/`--seed` custom properties |
| `app.js` | Keypad, platter, players, flipper, elapsed counter, synth sounds |
| `data/records.json` | **Canonical record + link data. Edit this to repair or swap media.** |
| `assets/` | Fonts (WOFF2), two bundled recordings, memorial photo, share image |
| `SOURCES.md` | Every source, verification status, license notes |
| `build/` | Working files: design plan, capture + sync scripts, review rounds |

## Swap or repair a record

1. Edit `data/records.json` — media types: `audio` (src → file in `assets/`), `youtube`
   (`videoId`), `poem` (`videoId` + `extra.greekPoem`), `tracks` (list with optional `alt`
   version per track), `text` (B1's `extra.translations`), `sealed` (D1, no player).
2. Run `python3 build/sync-inline-data.py` to copy the JSON into `index.html`'s inline mirror
   (used when the page is opened from file://).
3. If a record's audio/video goes dead, the record still plays as a card with its link-outs —
   no broken player — but fix the data anyway.

Wear rules: `wear` runs 0 (pristine) → 1 (ancient) and must stay monotonic with each record's
age. `seed` varies the foxing pattern so no two strips age alike. `chips` (0–3) picks an
edge-damage clip path.

## Deploy

GitHub Pages (repo `definitelyreal/odyssey`, branch `main`, root). `CNAME` file pins
odyssey.definitelyreal.com; DNS is a CNAME on the Definitely Real Cloudflare zone pointing to
`definitelyreal.github.io`. Push to `main` republishes.

---
_Claude · 2026-08-25 · Session: a29cc8d8-8643-4e90-97bd-25de479ae329_
