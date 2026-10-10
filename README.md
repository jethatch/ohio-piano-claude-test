# Ohio is a Piano

Ohio has 88 counties and a piano has 88 keys, so every county gets a key. Pick a Census
measure and the counties line up along the keyboard, lowest value on the lowest note.
Then play the map.

This is a from-scratch rebuild of Andy Woodruff's
[Ohio is a Piano](https://andywoodruff.com/blog/ohio-is-still-a-piano/) (Flash, 2009;
HTML, 2016) with current Census data. The idea is his. None of the original code, audio
or song data is reused, because the original repository carries no licence.

## Running it

It is a static site with no build step and no external services.

- **GitHub Pages:** push this folder to a repository and enable Pages. `index.html` is the entry point.
- **Locally:** `python3 -m http.server` in this folder, then open <http://localhost:8000>.
- **Straight from disk:** opening `index.html` works too, but browsers will not load the
  piano samples from `file://`, so it falls back to the built-in synthesizer.

## What it does

- **Sort notes by** any of 19 measures, across 15 survey periods (2006–2010 to 2020–2024).
- **Play the map** by moving the mouse over it, or by tapping and dragging on a touch screen.
- **Play the keyboard** under the map. Each key lights its county. With the keyboard
  focused, the arrow keys step through the counties and name each one. This is the way
  to play without a mouse; the counties on the map are not individually focusable.
- **Play counties in order**, lowest to highest.
- **Play a song** and watch which counties it uses. A marker tracks the song's geographic
  center: the average position of every note struck, so repeated notes and chords count
  more. It rarely strays far from the middle of the state. The songs are simplified excerpts.
- **Play a route** between two county seats. Routes are the shortest chain of neighboring
  counties, measured between county centers. They are not driving directions.
- **Record** what you play, replay it, and **copy a link** that restores the sort, the
  survey period and the tune. A link holds up to 400 notes, and pauses longer than
  13 seconds are shortened to 13.
- **Sound:** sampled grand piano by default, with a synthesizer you can switch to. The
  synthesizer also fills in automatically if the samples cannot load. If you choose the
  synthesizer, the samples (about 2 MB) are not downloaded on later visits.

## Files

| Path | Contents |
|---|---|
| `index.html`, `css/piano.css` | Page and styles |
| `js/app.js` | Map, keyboard, playback, recording |
| `js/audio.js` | Sample player and synthesizer (Web Audio) |
| `js/songs.js` | Four public-domain songs, arranged for this project |
| `js/data.js` | Generated: county shapes, neighbors and Census values |
| `audio/salamander/` | 30 piano samples, one every minor third |
| `tools/build_data.py` | Rebuilds `js/data.js` |

## Data

All data is from the U.S. Census Bureau and in the public domain.

- **Boundaries and land area:** 2024 cartographic boundary file, 1:5,000,000.
- **Everything else:** American Community Survey 5-year estimates, 2010 to 2024 vintages.
  Each vintage pools five years of surveys, so neighboring periods overlap and are not
  independent.

| Measure | ACS source |
|---|---|
| Total population, population per square mile | B01003 |
| Median age | B01002 |
| Average family size | People in families (B11002) divided by families (B11001) |
| Percent white, Black, Asian (non-Hispanic) | B03002, one race alone |
| Percent Hispanic or Latino | B03002, any race |
| Percent other or multiple race | B03002, everyone not counted above |
| Percent of all homes that are rented, owner-occupied, vacant | B25002 and B25003, share of all housing units including vacant ones |
| Median household income | B19013, in that vintage's dollars |
| Percent with a bachelor's degree or higher | B15002, age 25 and over |
| Percent below the poverty line | B17001 |
| Median home value | B25077, owner-occupied homes |
| Average commute time | B08013 divided by B08303, minutes, excludes people working from home |

These are survey estimates with margins of error, which are large for small counties,
so counties with close values can swap places from one period to the next. Counties that
tie on a measure are ordered alphabetically; median age in particular has many ties. The original map's crop
acreage measure is not included; it comes from the USDA rather than the Census Bureau.

### Rebuilding the data

```bash
python3 tools/build_data.py --cache /tmp/ohio-piano-cache
```

The script needs only the Python standard library. It reads ACS tables from the
data.census.gov table endpoint, which needs no API key but is the website's own backend
and not a documented API, so it may change. The official API at api.census.gov serves the
same tables and now requires a free key. To add a newer vintage, extend `YEARS` in the script.

## Credits

- Concept and original map: [Andy Woodruff](https://andywoodruff.com/).
- Piano samples: Salamander Grand Piano V3 by Alexander Holm,
  [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/), as distributed with Tone.js.
- Songs: The Entertainer (Joplin), Ode to Joy and Für Elise (Beethoven), Prelude in C (Bach).
