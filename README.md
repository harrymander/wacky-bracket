# wacky-bracket (React + TypeScript + Vite)

Static client-side app for building multi-round race brackets.

## Features

- Per-heat configuration (not just per-round):
  - participants in each heat
  - qualifiers from each heat
- Different heats in the same round can use different values.
- Laps-based progression (race format):
  - higher laps completed is better
  - top `n` per heat advance
  - duplicate lap totals are allowed only below the advancement cutoff
  - ties at or across the top-`n` cutoff are invalid and must be broken
- Interactive bracket view with locked downstream rounds until lap totals are complete.
- Read-only display popout mode for second-screen bracket viewing, with live updates from the main window.
- Participant input:
  - manual list
  - CSV import
- Persistence and I/O:
  - localStorage autosave
  - JSON import/export
  - reset to defaults

## Run

```bash
npm install
npm run dev
```

In the main app, use **Open display popout** to launch a read-only bracket view.
You can also open it directly with `?view=display` (for example: `http://localhost:5173/?view=display`).

## Build

```bash
npm run build
npm run preview
```

## Code structure

- `src/hooks/useTournamentState.ts` manages tournament state, actions, persistence, and cross-window sync.
- `src/components/SetupPanel.tsx` (with setup tile subcomponents) contains setup/editing UI.
- `src/components/BracketPanel.tsx` contains bracket display/edit rendering.
- `src/App.tsx` is the composition root.

## Configuration rules

1. Round 1 participant slots must exactly match participant count.
2. For each round transition, total qualifiers from the current round must equal total entrant slots in the next round.
3. For each heat, `advanceCount` must be less than or equal to `participantSlots`.
