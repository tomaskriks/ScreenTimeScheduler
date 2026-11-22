# Cartoon Time

A small phone app that helps the kids agree on which cartoons fit into today's screen time.

- The bar at the top is the allowed time (40 minutes by default). Each chosen cartoon is a block in it.
- Tap a picture to add one episode, or a 10-minute piece of a movie. Tap a block to take it out.
- Wishes first, filling second: tap a kid's face, then up to 3 pictures. Nothing is added yet.
  When everyone has wished, **Fill the 40 minutes** arranges all wishes: each kid gets something
  if at all possible, series get whole episodes, movies share what is left. A movie never gets
  less than the "Shortest movie piece" setting (10 minutes by default); a wish that cannot get
  that much is left out.
- Hold the gear to open the parent screen: search and add cartoons, fix lengths, change the time and names.
  Tap a cartoon's picture there to choose another poster (or just the first letter).

## How it is built

Plain HTML, CSS and JavaScript in `docs/`, no build step. It is an installable web app (PWA):
after the first visit it opens without internet. Everything is saved on the phone (`localStorage`).

| File | What it does |
|---|---|
| `docs/js/planner.js` | The rules: what fits, and how wishes are arranged |
| `docs/js/catalog.js` | Looks up series on TVmaze and movies on Wikipedia/Wikidata (free, no key) |
| `docs/js/store.js` | Saving and loading |
| `docs/js/app.js` | The screens |
| `docs/sw.js` | Offline support |

TVmaze reports the TV slot length including adverts (30 min for a 22-minute episode). The app estimates
the real length for round slots; correct it on the parent screen if it is off.

## Run on this PC

```
dotnet run --project dev-server
```

Then open http://localhost:5080.

## Publish

`docs/` is served by GitHub Pages (repo Settings → Pages → Deploy from a branch → `main` → `/docs`).
After changing app files, raise the cache names at the top of `docs/sw.js` only if a file was renamed or removed;
normal edits reach the phone the next time it opens the app online.

## On the phone

Open the Pages address in Chrome → menu → **Add to Home screen**.
