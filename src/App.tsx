import { type ChangeEvent, useEffect, useMemo, useState } from 'react'
import './App.css'
import {
  DEFAULT_PARTICIPANTS,
  DEFAULT_ROUNDS,
  buildTournament,
  createHeat,
  evaluateHeatLaps,
  normalizeRound,
  parseParticipantsFromCsv,
  parseParticipantsFromLines,
  totalRoundOutgoing,
  totalRoundSlots,
  type RoundConfig,
  type TournamentResults,
  validateTournament,
} from './lib/tournament'

const STORAGE_KEY = 'wacky-bracket-state-v1'

type StoredState = {
  participants: typeof DEFAULT_PARTICIPANTS
  rounds: RoundConfig[]
  results: TournamentResults
}

const DEFAULT_STATE: StoredState = {
  participants: DEFAULT_PARTICIPANTS,
  rounds: DEFAULT_ROUNDS,
  results: {},
}

const clampPositive = (value: string | number, fallback = 1): number => {
  const parsed = Number.parseInt(String(value), 10)
  if (!Number.isFinite(parsed) || parsed < 1) {
    return fallback
  }
  return parsed
}

const getStoredState = (): StoredState => {
  const raw = window.localStorage.getItem(STORAGE_KEY)
  if (!raw) {
    return DEFAULT_STATE
  }

  try {
    const parsed = JSON.parse(raw) as Partial<StoredState>
    const participants = Array.isArray(parsed.participants) ? parsed.participants : DEFAULT_STATE.participants
    const rounds = Array.isArray(parsed.rounds)
      ? parsed.rounds.map((round, index) => normalizeRound(round, index))
      : DEFAULT_STATE.rounds
    const results = parsed.results && typeof parsed.results === 'object' ? parsed.results : {}
    return { participants, rounds, results }
  } catch {
    return DEFAULT_STATE
  }
}

function App() {
  const isDisplayMode = useMemo(() => {
    const query = new URLSearchParams(window.location.search)
    return query.get('view') === 'display'
  }, [])
  const [participants, setParticipants] = useState(() => getStoredState().participants)
  const [rounds, setRounds] = useState(() => getStoredState().rounds)
  const [results, setResults] = useState<TournamentResults>(() => getStoredState().results)
  const [participantLines, setParticipantLines] = useState(() =>
    getStoredState()
      .participants.map((entry) => entry.name)
      .join('\n'),
  )
  const [statusMessage, setStatusMessage] = useState('')
  const [participantsOpen, setParticipantsOpen] = useState(true)
  const [roundsOpen, setRoundsOpen] = useState(true)

  const errors = useMemo(() => validateTournament(participants, rounds), [participants, rounds])
  const roundStates = useMemo(() => buildTournament(rounds, participants, results), [rounds, participants, results])

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ participants, rounds, results }))
  }, [participants, rounds, results])

  useEffect(() => {
    const syncFromStorage = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY) {
        return
      }
      const next = getStoredState()
      setParticipants(next.participants)
      setRounds(next.rounds)
      setResults(next.results)
      setParticipantLines(next.participants.map((entry) => entry.name).join('\n'))
    }

    window.addEventListener('storage', syncFromStorage)
    return () => window.removeEventListener('storage', syncFromStorage)
  }, [])

  const clearStatus = () => setStatusMessage('')

  const applyParticipants = () => {
    clearStatus()
    const parsed = parseParticipantsFromLines(participantLines)
    if (parsed.length === 0) {
      setStatusMessage('Participant list is empty.')
      return
    }
    setParticipants(parsed)
    setResults({})
    setStatusMessage(`Loaded ${parsed.length} participants.`)
  }

  const importCsv = async (event: ChangeEvent<HTMLInputElement>) => {
    clearStatus()
    const file = event.target.files?.[0]
    if (!file) {
      return
    }
    const text = await file.text()
    const parsed = parseParticipantsFromCsv(text)
    if (parsed.length === 0) {
      setStatusMessage('No participant names found in CSV.')
      return
    }
    setParticipants(parsed)
    setParticipantLines(parsed.map((entry) => entry.name).join('\n'))
    setResults({})
    setStatusMessage(`Imported ${parsed.length} participants from CSV.`)
    event.target.value = ''
  }

  const updateHeat = (roundIndex: number, heatIndex: number, field: 'participantSlots' | 'advanceCount', value: string) => {
    clearStatus()
    setRounds((previous) =>
      previous.map((round, currentRoundIndex) => {
        if (currentRoundIndex !== roundIndex) {
          return round
        }
        const nextHeats = round.heats.map((heat, currentHeatIndex) => {
          if (currentHeatIndex !== heatIndex) {
            return heat
          }
          const parsed = clampPositive(value, heat[field])
          if (field === 'participantSlots') {
            const participantSlots = parsed
            const advanceCount = Math.min(heat.advanceCount, participantSlots)
            return { ...heat, participantSlots, advanceCount }
          }
          return { ...heat, advanceCount: Math.min(parsed, heat.participantSlots) }
        })
        return { ...round, heats: nextHeats }
      }),
    )
    setResults({})
  }

  const addHeat = (roundIndex: number) => {
    clearStatus()
    setRounds((previous) =>
      previous.map((round, currentRoundIndex) => {
        if (currentRoundIndex !== roundIndex) {
          return round
        }
        return {
          ...round,
          heats: [...round.heats, createHeat(roundIndex, round.heats.length, 2, 1)],
        }
      }),
    )
    setResults({})
  }

  const removeHeat = (roundIndex: number, heatIndex: number) => {
    clearStatus()
    setRounds((previous) =>
      previous.map((round, currentRoundIndex) => {
        if (currentRoundIndex !== roundIndex || round.heats.length <= 1) {
          return round
        }
        return {
          ...round,
          heats: round.heats.filter((_, currentHeatIndex) => currentHeatIndex !== heatIndex),
        }
      }),
    )
    setResults({})
  }

  const addRound = () => {
    clearStatus()
    setRounds((previous) => {
      const previousRound = previous[previous.length - 1]
      const incoming = totalRoundOutgoing(previousRound)
      return [
        ...previous,
        {
          id: `round-${previous.length + 1}`,
          label: `Round ${previous.length + 1}`,
          heats: [createHeat(previous.length, 0, incoming, 1)],
        },
      ]
    })
    setResults({})
  }

  const removeRound = () => {
    clearStatus()
    setRounds((previous) => {
      if (previous.length <= 1) {
        return previous
      }
      return previous.slice(0, -1)
    })
    setResults({})
  }

  const updateRoundLabel = (roundIndex: number, value: string) => {
    clearStatus()
    setRounds((previous) =>
      previous.map((round, currentRoundIndex) => {
        if (currentRoundIndex !== roundIndex) {
          return round
        }
        return {
          ...round,
          label: value,
        }
      }),
    )
  }

  const setLaps = (roundId: string, heatId: string, participantId: string, value: string) => {
    setResults((previous) => ({
      ...previous,
      [roundId]: {
        ...(previous[roundId] || {}),
        [heatId]: {
          ...(previous[roundId]?.[heatId] || {}),
          [participantId]: value,
        },
      },
    }))
  }

  const resetState = () => {
    setParticipants(DEFAULT_STATE.participants)
    setRounds(DEFAULT_STATE.rounds)
    setResults({})
    setParticipantLines(DEFAULT_STATE.participants.map((entry) => entry.name).join('\n'))
    setStatusMessage('Reset to default wacky-bracket.')
  }

  const exportJson = () => {
    const blob = new Blob([JSON.stringify({ participants, rounds, results }, null, 2)], {
      type: 'application/json',
    })
    const url = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'wacky-bracket.json'
    link.click()
    window.URL.revokeObjectURL(url)
  }

  const importJson = async (event: ChangeEvent<HTMLInputElement>) => {
    clearStatus()
    const file = event.target.files?.[0]
    if (!file) {
      return
    }
    const text = await file.text()
    try {
      const parsed = JSON.parse(text) as Partial<StoredState>
      const nextParticipants = Array.isArray(parsed.participants) ? parsed.participants : []
      const nextRounds = Array.isArray(parsed.rounds)
        ? parsed.rounds.map((round, index) => normalizeRound(round, index))
        : []
      const nextResults = parsed.results && typeof parsed.results === 'object' ? parsed.results : {}

      if (nextParticipants.length === 0 || nextRounds.length === 0) {
        setStatusMessage('JSON import failed: missing participants or rounds.')
        return
      }
      setParticipants(nextParticipants)
      setRounds(nextRounds)
      setResults(nextResults)
      setParticipantLines(nextParticipants.map((entry) => entry.name).join('\n'))
      setStatusMessage('Tournament imported from JSON.')
    } catch {
      setStatusMessage('JSON import failed: invalid JSON.')
    } finally {
      event.target.value = ''
    }
  }

  const openDisplayPopout = () => {
    const nextUrl = new URL(window.location.href)
    nextUrl.searchParams.set('view', 'display')
    const popout = window.open(nextUrl.toString(), 'wacky-bracket-display', 'popup=yes,width=1600,height=900')
    if (!popout) {
      setStatusMessage('Unable to open popout. Check your browser popup settings.')
    }
  }

  return (
    <main className={`app ${isDisplayMode ? 'display-mode' : ''}`}>
      <header className="page-header">
        <h1>Wacky Racers</h1>
        {isDisplayMode ? <p>Read-only display mode</p> : null}
      </header>

      {!isDisplayMode ? (
        <section className="panel">
          <h2>Setup</h2>
          <div className="io-row">
            <button type="button" onClick={exportJson}>
              Export JSON
            </button>
            <label className="file-button">
              Import JSON
              <input type="file" accept="application/json" onChange={importJson} />
            </label>
            <button type="button" className="ghost" onClick={resetState}>
              Reset
            </button>
            <button type="button" className="ghost" onClick={openDisplayPopout}>
              Open display popout
            </button>
          </div>

          <article className="setup-tile">
            <div className="setup-tile-header">
              <h3>Participants</h3>
              <button type="button" className="ghost" onClick={() => setParticipantsOpen((value) => !value)}>
                {participantsOpen ? 'Collapse' : 'Expand'}
              </button>
            </div>
            {participantsOpen ? (
              <>
                <label htmlFor="participants" className="participants-label">
                  Participants (one per line)
                </label>
                <textarea
                  id="participants"
                  rows={8}
                  value={participantLines}
                  onChange={(event) => setParticipantLines(event.target.value)}
                />
                <div className="io-row">
                  <button type="button" onClick={applyParticipants}>
                    Apply participant list
                  </button>
                  <label className="file-button">
                    Import participants CSV
                    <input type="file" accept=".csv,text/csv" onChange={importCsv} />
                  </label>
                </div>
              </>
            ) : null}
          </article>

          <article className="setup-tile">
            <div className="setup-tile-header">
              <h3>Rounds</h3>
              <button type="button" className="ghost" onClick={() => setRoundsOpen((value) => !value)}>
                {roundsOpen ? 'Collapse' : 'Expand'}
              </button>
            </div>
            {roundsOpen ? (
              <>
                <div className="round-controls-head">
                  <div className="io-row">
                    <button type="button" onClick={addRound}>
                      Add round
                    </button>
                    <button type="button" className="ghost" onClick={removeRound}>
                      Remove last round
                    </button>
                  </div>
                </div>

                {rounds.map((round, roundIndex) => (
                  <article key={round.id} className="round-config-card">
                    <label className="round-name-field">
                      Round name
                      <input
                        className="round-name-input"
                        type="text"
                        value={round.label}
                        onChange={(event) => updateRoundLabel(roundIndex, event.target.value)}
                        placeholder={`Round ${roundIndex + 1}`}
                      />
                    </label>
                    <p className="hint">
                      Incoming slots: {totalRoundSlots(round)} · Outgoing qualifiers: {totalRoundOutgoing(round)}
                    </p>
                    <div className="io-row">
                      <button type="button" onClick={() => addHeat(roundIndex)}>
                        Add heat
                      </button>
                    </div>

                    {round.heats.map((heat, heatIndex) => (
                      <div key={heat.id} className="heat-config-row">
                        <strong>{heat.label}</strong>
                        <label>
                          Participants
                          <input
                            type="number"
                            min={1}
                            value={heat.participantSlots}
                            onChange={(event) => updateHeat(roundIndex, heatIndex, 'participantSlots', event.target.value)}
                          />
                        </label>
                        <label>
                          Advance
                          <input
                            type="number"
                            min={1}
                            value={heat.advanceCount}
                            disabled={roundIndex === rounds.length - 1}
                            onChange={(event) => updateHeat(roundIndex, heatIndex, 'advanceCount', event.target.value)}
                          />
                        </label>
                        <button
                          type="button"
                          className="ghost"
                          disabled={round.heats.length <= 1}
                          onClick={() => removeHeat(roundIndex, heatIndex)}
                        >
                          Remove heat
                        </button>
                      </div>
                    ))}
                  </article>
                ))}
              </>
            ) : null}
          </article>

          {statusMessage ? <p className="status">{statusMessage}</p> : null}
          {errors.length > 0 ? (
            <div className="errors">
              <h3>Configuration issues</h3>
              <ul>
                {errors.map((error) => (
                  <li key={error}>{error}</li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="ok">Configuration is valid.</p>
          )}
        </section>
      ) : null}

      <section className="panel">
        <h2>Bracket</h2>
        <div className="round-lane">
          {roundStates.map((round, roundIndex) => (
            <article key={round.id} className="round-card">
              <header>
                <h3>{round.label}</h3>
                <p>{round.heats.length} heats</p>
              </header>

              {round.messages.map((message) => (
                <p key={message} className="warn">
                  {message}
                </p>
              ))}

              {round.heats.map((heat) => {
                const ranking = evaluateHeatLaps(heat, results?.[round.id]?.[heat.id])
                return (
                  <section key={heat.id} className="heat-card">
                    <h4>
                      {heat.label} · Slots {heat.participantSlots}
                    </h4>
                    {heat.entrants.map((entrant, entrantIndex) => {
                      const participant = entrant.participant
                      const placeholder = entrant.source
                        ? `R${entrant.source.fromRound + 1} H${entrant.source.fromHeat + 1} #${entrant.source.rank}`
                        : 'Unassigned'
                      const currentValue =
                        participant && results?.[round.id]?.[heat.id]?.[participant.id]
                          ? results[round.id][heat.id][participant.id]
                          : ''
                      const isAdvancing =
                        ranking.isComplete &&
                        !ranking.hasTie &&
                        ranking.ranked
                          .slice(0, heat.advanceCount)
                          .some((entry) => entry.entrant.participant?.id === participant?.id)

                      return (
                        <div
                          key={`${heat.id}-slot-${entrantIndex}-${participant?.id ?? 'unassigned'}`}
                          className={`entrant-row ${isAdvancing ? 'advancing' : ''}`}
                        >
                          <span>{participant ? participant.name : placeholder}</span>
                          {isDisplayMode ? (
                            <span className="lap-value">{participant ? currentValue || '-' : '-'}</span>
                          ) : (
                            <input
                              type="number"
                              min={0}
                              step={0.25}
                              disabled={!participant}
                              value={currentValue}
                              placeholder={participant ? 'Laps' : '-'}
                              onChange={(event) =>
                                participant && setLaps(round.id, heat.id, participant.id, event.target.value)
                              }
                            />
                          )}
                        </div>
                      )
                    })}
                    {ranking.hasTie ? (
                      <p className="warn">Top qualifying positions must have unique lap totals.</p>
                    ) : null}
                  </section>
                )
              })}
              {roundIndex < roundStates.length - 1 && !round.canAdvance ? (
                <p className="locked">Next round stays locked until all lap totals are valid.</p>
              ) : null}
            </article>
          ))}
        </div>
      </section>
    </main>
  )
}

export default App
