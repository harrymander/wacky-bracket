# AGENTS.md

## Project workflow

- Keep changes focused and scoped to the requested feature or bug fix.
- Preserve existing behavior unless the request explicitly changes it.
- Validate code changes with:
  - `npm run lint`
  - `npm run build`
- Update `README.md` as appropriate when changes are made (e.g. to the code
  structure or configuration rules).

## Planning and implementation

- In plan mode, write/update `plan.md` first, then implement only after explicit
  go-ahead.
- In autopilot mode, proceed to implement directly unless blocked by ambiguity.

## Commit policy

- Whenever the user asks to implement a feature or fix a bug in autopilot or
  plan mode, create commits for each individual feature/change/fix as
  appropriate.
- If the instruction says otherwise (for example, "do not commit"), follow that
  instruction.
