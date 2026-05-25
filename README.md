# wacky-bracket

A [vibe-coded](#bot-compliments-bot-%EF%B8%8F) web app for displaying Wacky Racers tournament bracket.

## Run

```bash
npm ci
npm run dev
```

In the main app, use **Open display popout** to launch a read-only bracket view.

You can also open it directly with `?view=display` (for example:
`http://localhost:5173/?view=display`).

The final round is auto-managed as a single-heat **Final** and is not configured in setup.

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
2. For each round transition, total qualifiers from the current round must equal
   total entrant slots in the next round.
3. For each heat, `advanceCount` must be less than or equal to
   `participantSlots`.
4. The final round is derived from prior-round qualifiers and is always one heat.

## Round transition scheme

Qualifiers are seeded into the next round using an interleaved, rank-major
ordering to mix heats. Source slots are ordered by rank across heats (all 1st
place finishers, then all 2nd place finishers, and so on), then assigned
round-robin across destination heats (skipping heats once they reach their
configured slot counts). This ensures each destination heat contains a mix of
high and low qualifiers instead of stacking top finishers together.

Tournament configuration and results are persisted in `localStorage`. They can
be exported/imported via JSON.

## Bot compliments bot ❤️

![Bot compliments bot](./email.png)
