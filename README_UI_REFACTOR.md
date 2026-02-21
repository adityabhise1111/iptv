# IPTV UI Refactor Plan

## Goals
- Remove sidebar layout
- Add search bar at the top
- Make video player full-width
- Add horizontal scrollable category tabs
- Parse `group-title` and `tvg-logo` from M3U
- Display channel logos in cards
- Maintain dark theme (`bg-gray-900`, blue accents)

## Layout Structure

App Layout Order:
1. Search Bar (top)
2. Full-width Video Player
3. Horizontal Category Tabs
4. Channel Grid

## Data Requirements
- Parse `group-title` as category
- Parse `tvg-logo` as channel logo URL
- Group channels by category
- Support filtering by search text
- Support filtering by selected category

## Components To Create

- `components/SearchBar.tsx`
- `components/VideoPlayer.tsx` (refactor if exists)
- `components/CategoryTabs.tsx`
- `components/ChannelCard.tsx`
- `components/ChannelGrid.tsx`

## State Requirements
- `selectedChannel`
- `selectedCategory`
- `searchQuery`
- `groupedChannels`

## Styling Rules
- Keep dark theme
- Use `bg-gray-900` background
- Blue accent for active states
- Rounded cards
- Smooth hover transitions

## Implementation Steps
1. Create modular UI component files in `components/` and wire them from `script.js`.
2. Replace sidebar layout with top-to-bottom flow in `index.html`.
3. Add controlled search state with lightweight debounce.
4. Build horizontal category tabs from parsed group titles.
5. Extend parser to include category and logo with safe fallbacks.
6. Render channel cards with logos and selected states.
7. Remove obsolete layout markup/classes and validate with `npm run build`.
8. Commit each major phase for traceability.
