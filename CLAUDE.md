# Kanji Masta
## UI Design

### Color Theme
- MUI dark mode as base
- Primary accent: indigo `#4338ca` (hover: `#3730a3`)
- Used for: quiz slot cards, login form background, highlighted sections
- Prominent action buttons (Capture Kanji, Sign In): light style — `grey.100` bg with indigo or dark text, pill-shaped (`borderRadius: 6-8`)
- Inner buttons on accent sections (Start Session): white bg with indigo text

### Button Patterns
- **Full-width action buttons** (Capture Kanji, Sign In): rounded pill shape, bold text, letter-spacing
- **Capture Kanji**: fixed bottom, light button (`grey.100`/`grey.900`), camera icon in translucent circle
- **Start Session**: white on indigo card, `ChevronRight` end icon
- **Sign In**: light button (`grey.100`/indigo) inside indigo form card

### Layout
- No AppBar — pages manage their own headers
- Mobile-first: `maxWidth: 480`, centered
- Settings accessed via gear icon in page header, dedicated `/settings` page
- Bottom action bar with gradient fade from transparent to background

## Build & Run

Run `make help` for all commands. Local dev requires 3 terminals:

```
make emulators   # Terminal 1: Firebase emulators (Auth:9099, DC:9399, Functions:5001, Storage:9199)
make backend     # Terminal 2: Ktor backend (port 8080, auto-connects to emulators)
make frontend    # Terminal 3: React dev server (port 5173)
```

Other useful commands:
- `make setup` — install all dependencies (npm, pip, gradle)
- `make seed` — seed KanjiMaster data into local emulator
- `make check` — type-check frontend + build backend
- `make docker-up` — production Docker build (backend:8080, frontend:3000)
