import { useEffect, useMemo, useState } from 'react'
import {
  DEFAULT_PARTICIPANTS,
  DEFAULT_ROUNDS,
  buildTournament,
  createHeat,
  normalizeRound,
  parseParticipantsFromCsv,
  parseParticipantsFromLines,
  totalRoundOutgoing,
  type RoundConfig,
  type TournamentResults,
  validateTournament,
} from '../lib/tournament'

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

const ensureFinalRoundShape = (inputRounds: RoundConfig[]): RoundConfig[] => {
  const baseRounds = inputRounds.length > 0 ? inputRounds : DEFAULT_ROUNDS
  const hasExplicitFinal =
    baseRounds.length > 1 && (baseRounds[baseRounds.length - 1].label || '').trim().toLowerCase() === 'final'
  const prelimRounds = hasExplicitFinal ? baseRounds.slice(0, -1) : baseRounds
  const safePrelimRounds = prelimRounds.length > 0 ? prelimRounds : [DEFAULT_ROUNDS[0]]
  const lastPrelimRound = safePrelimRounds[safePrelimRounds.length - 1]
  const finalIncomingSlots = Math.max(1, totalRoundOutgoing(lastPrelimRound))
  const existingFinal = baseRounds.length > 1 ? baseRounds[baseRounds.length - 1] : undefined
  const finalId = existingFinal?.id || `round-${safePrelimRounds.length + 1}`
  const finalHeat = {
    ...createHeat(safePrelimRounds.length, 0, finalIncomingSlots, 1),
    id: `${finalId}-heat-1`,
    label: 'Final',
    participantSlots: finalIncomingSlots,
    advanceCount: 1,
  }

  return [
    ...safePrelimRounds,
    {
      id: finalId,
      label: 'Final',
      heats: [finalHeat],
    },
  ]
}

export const useTournamentState = () => {
  const [participants, setParticipants] = useState(() => getStoredState().participants)
  const [rounds, setRounds] = useState(() => ensureFinalRoundShape(getStoredState().rounds))
  const [results, setResults] = useState<TournamentResults>(() => getStoredState().results)
  const [participantLines, setParticipantLines] = useState(() =>
    getStoredState()
      .participants.map((entry) => entry.name)
      .join('\n'),
  )
  const [statusMessage, setStatusMessage] = useState('')
  const [participantsOpen, setParticipantsOpen] = useState(false)
  const [roundsOpen, setRoundsOpen] = useState(false)

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
      setRounds(ensureFinalRoundShape(next.rounds))
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

  const importCsvFromFile = async (file: File | undefined) => {
    clearStatus()
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
  }

  const updateHeat = (
    roundIndex: number,
    heatIndex: number,
    field: 'participantSlots' | 'advanceCount',
    value: string,
  ) => {
    clearStatus()
    setRounds((previous) =>
      ensureFinalRoundShape(
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
      ),
    )
    setResults({})
  }

  const addHeat = (roundIndex: number) => {
    clearStatus()
    setRounds((previous) =>
      ensureFinalRoundShape(
        previous.map((round, currentRoundIndex) => {
        if (currentRoundIndex !== roundIndex) {
          return round
        }
        return {
          ...round,
          heats: [...round.heats, createHeat(roundIndex, round.heats.length, 2, 1)],
        }
      }),
      ),
    )
    setResults({})
  }

  const removeHeat = (roundIndex: number, heatIndex: number) => {
    clearStatus()
    setRounds((previous) =>
      ensureFinalRoundShape(
        previous.map((round, currentRoundIndex) => {
        if (currentRoundIndex !== roundIndex || round.heats.length <= 1) {
          return round
        }
        return {
          ...round,
          heats: round.heats.filter((_, currentHeatIndex) => currentHeatIndex !== heatIndex),
        }
      }),
      ),
    )
    setResults({})
  }

  const addRound = () => {
    clearStatus()
    setRounds((previous) => {
      const prelimRounds = previous.slice(0, -1)
      const sourceRound = prelimRounds[prelimRounds.length - 1]
      const incoming = totalRoundOutgoing(sourceRound)
      const nextRounds = [
        ...prelimRounds,
        {
          id: `round-${prelimRounds.length + 1}`,
          label: `Round ${prelimRounds.length + 1}`,
          heats: [createHeat(prelimRounds.length, 0, incoming, 1)],
        },
      ]
      return ensureFinalRoundShape(nextRounds)
    })
    setResults({})
  }

  const removeRound = () => {
    clearStatus()
    setRounds((previous) => {
      const prelimRounds = previous.slice(0, -1)
      if (prelimRounds.length <= 1) {
        return previous
      }
      return ensureFinalRoundShape(prelimRounds.slice(0, -1))
    })
    setResults({})
  }

  const updateRoundLabel = (roundIndex: number, value: string) => {
    clearStatus()
    setRounds((previous) =>
      ensureFinalRoundShape(
        previous.map((round, currentRoundIndex) => {
        if (currentRoundIndex !== roundIndex) {
          return round
        }
        return {
          ...round,
          label: value,
        }
      }),
      ),
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
    setRounds(ensureFinalRoundShape(DEFAULT_STATE.rounds))
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

  const importJsonFromFile = async (file: File | undefined) => {
    clearStatus()
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
      setRounds(ensureFinalRoundShape(nextRounds))
      setResults(nextResults)
      setParticipantLines(nextParticipants.map((entry) => entry.name).join('\n'))
      setStatusMessage('Tournament imported from JSON.')
    } catch {
      setStatusMessage('JSON import failed: invalid JSON.')
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

  return {
    participants,
    rounds,
    results,
    participantLines,
    statusMessage,
    participantsOpen,
    roundsOpen,
    errors,
    roundStates,
    setParticipantLines,
    toggleParticipantsOpen: () => setParticipantsOpen((value) => !value),
    toggleRoundsOpen: () => setRoundsOpen((value) => !value),
    applyParticipants,
    importCsvFromFile,
    updateHeat,
    addHeat,
    removeHeat,
    addRound,
    removeRound,
    updateRoundLabel,
    setLaps,
    resetState,
    exportJson,
    importJsonFromFile,
    openDisplayPopout,
  }
}
