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
- Frontend: `cd frontend && npm run dev` (port 5173)
- Backend: `cd backend && ./gradlew run` (port 8080)
- Firebase emulator: `firebase emulators:start` (Auth on port 9099)
- Docker: `docker compose up --build` (backend:8080, frontend:3000)
