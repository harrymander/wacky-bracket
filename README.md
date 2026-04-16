# wacky-bracket (React + TypeScript + Vite)

Static client-side app for building multi-round race brackets.

## Features

- Per-heat configuration (not just per-round):
  - participants in each heat
  - qualifiers from each heat
- Different heats in the same round can use different values.
- Rank-based progression (race format):
  - lower rank is better
  - top `n` per heat advance
  - duplicate ranks in the same heat are invalid
- Interactive bracket view with locked downstream rounds until ranks are complete.
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

## Build

```bash
npm run build
npm run preview
```

## Configuration rules

1. Round 1 participant slots must exactly match participant count.
2. For each round transition, total qualifiers from the current round must equal total entrant slots in the next round.
3. For each heat, `advanceCount` must be less than or equal to `participantSlots`.
