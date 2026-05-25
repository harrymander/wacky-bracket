import { useEffect, useMemo, useState } from 'react'
import {
  DEFAULT_PARTICIPANTS,
  DEFAULT_ROUNDS,
  buildTournament,
  createHeat,
  generateId,
  hasStructuralRoundChanges,
  normalizeRound,
  parseParticipantsFromCsv,
  parseParticipantsFromLines,
  roundsAreEqual,
  shuffleLines,
  sortLines,
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

export const ensureFinalRoundShape = (inputRounds: RoundConfig[]): RoundConfig[] => {
  const baseRounds = inputRounds.length > 0 ? inputRounds : DEFAULT_ROUNDS
  const hasExplicitFinal =
    baseRounds.length > 1 && (baseRounds[baseRounds.length - 1].label || '').trim().toLowerCase() === 'final'
  const prelimRounds = hasExplicitFinal ? baseRounds.slice(0, -1) : baseRounds
  const safePrelimRounds = prelimRounds.length > 0 ? prelimRounds : [DEFAULT_ROUNDS[0]]
  const lastPrelimRound = safePrelimRounds[safePrelimRounds.length - 1]
  const finalIncomingSlots = Math.max(1, totalRoundOutgoing(lastPrelimRound))
  const existingFinal = hasExplicitFinal ? baseRounds[baseRounds.length - 1] : undefined
  const finalId = existingFinal?.id || generateId()
  const finalHeat = {
    ...createHeat(finalIncomingSlots, 1),
    id: existingFinal?.heats?.[0]?.id || generateId(),
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
  const [draftRounds, setDraftRounds] = useState(() => ensureFinalRoundShape(getStoredState().rounds))
  const [confirmModalOpen, setConfirmModalOpen] = useState(false)
  const [confirmResetOpen, setConfirmResetOpen] = useState(false)
  const [pendingImport, setPendingImport] = useState<StoredState | null>(null)
  const [participantsOpen, setParticipantsOpen] = useState(false)
  const [roundsOpen, setRoundsOpen] = useState(false)

  const draftParticipants = useMemo(() => parseParticipantsFromLines(participantLines), [participantLines])
  const committedParticipantLines = useMemo(() => participants.map((e) => e.name).join('\n'), [participants])
  const hasPendingChanges = useMemo(
    () => participantLines !== committedParticipantLines || !roundsAreEqual(draftRounds, rounds),
    [participantLines, committedParticipantLines, draftRounds, rounds],
  )
  const hasStructuralChanges = useMemo(() => {
    const participantNamesChanged = participantLines !== committedParticipantLines
    return participantNamesChanged || hasStructuralRoundChanges(draftRounds, rounds)
  }, [participantLines, committedParticipantLines, draftRounds, rounds])

  const errors = useMemo(() => validateTournament(draftParticipants, draftRounds), [draftParticipants, draftRounds])
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
      setDraftRounds(ensureFinalRoundShape(next.rounds))
    }

    window.addEventListener('storage', syncFromStorage)
    return () => window.removeEventListener('storage', syncFromStorage)
  }, [])

  const clearStatus = () => setStatusMessage('')

  const applyDrafts = () => {
    clearStatus()
    const parsed = parseParticipantsFromLines(participantLines)
    if (parsed.length === 0) {
      setConfirmModalOpen(false)
      setStatusMessage('Participant list is empty.')
      return
    }
    const structural = hasStructuralChanges
    setParticipants(parsed)
    setRounds(draftRounds)
    if (structural) {
      setResults({})
    }
    setConfirmModalOpen(false)
    setStatusMessage('Configuration applied.')
  }

  const requestApply = () => {
    if (!hasPendingChanges || errors.length > 0) return
    const resultsExist = Object.keys(results).length > 0
    if (hasStructuralChanges && resultsExist) {
      setConfirmModalOpen(true)
    } else {
      applyDrafts()
    }
  }

  const revertDrafts = () => {
    setDraftRounds(rounds)
    setParticipantLines(committedParticipantLines)
    clearStatus()
  }

  const cancelApply = () => {
    setConfirmModalOpen(false)
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
    setParticipantLines(parsed.map((entry) => entry.name).join('\n'))
    setStatusMessage(`Loaded ${parsed.length} participants from CSV. Click Apply to confirm.`)
  }

  const updateHeat = (
    roundIndex: number,
    heatIndex: number,
    field: 'participantSlots' | 'advanceCount',
    value: string,
  ) => {
    clearStatus()
    setDraftRounds((previous) =>
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
  }

  const addHeat = (roundIndex: number) => {
    clearStatus()
    setDraftRounds((previous) =>
      ensureFinalRoundShape(
        previous.map((round, currentRoundIndex) => {
        if (currentRoundIndex !== roundIndex) {
          return round
        }
        return {
          ...round,
          heats: [...round.heats, createHeat(2, 1)],
        }
      }),
      ),
    )
  }

  const removeHeat = (roundIndex: number, heatIndex: number) => {
    clearStatus()
    setDraftRounds((previous) =>
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
  }

  const addRound = () => {
    clearStatus()
    setDraftRounds((previous) => {
      const prelimRounds = previous.slice(0, -1)
      const sourceRound = prelimRounds[prelimRounds.length - 1]
      const incoming = totalRoundOutgoing(sourceRound)
      const nextRounds = [
        ...prelimRounds,
        {
          id: generateId(),
          label: `Round ${prelimRounds.length + 1}`,
          heats: [createHeat(incoming, 1)],
        },
      ]
      return ensureFinalRoundShape(nextRounds)
    })
  }

  const removeRound = () => {
    clearStatus()
    setDraftRounds((previous) => {
      const prelimRounds = previous.slice(0, -1)
      if (prelimRounds.length <= 1) {
        return previous
      }
      return ensureFinalRoundShape(prelimRounds.slice(0, -1))
    })
  }

  const updateRoundLabel = (roundIndex: number, value: string) => {
    clearStatus()
    const transform = (previous: RoundConfig[]) =>
      ensureFinalRoundShape(
        previous.map((round, currentRoundIndex) => {
          if (currentRoundIndex !== roundIndex) return round
          return { ...round, label: value }
        }),
      )
    setRounds(transform)
    setDraftRounds(transform)
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
    setDraftRounds(ensureFinalRoundShape(DEFAULT_STATE.rounds))
    setConfirmModalOpen(false)
    setConfirmResetOpen(false)
    setStatusMessage('Reset to default wacky-bracket.')
  }

  const requestReset = () => {
    setConfirmResetOpen(true)
  }

  const cancelReset = () => {
    setConfirmResetOpen(false)
  }

  const formatExportTimestamp = (value: Date) => {
    const year = value.getFullYear()
    const month = String(value.getMonth() + 1).padStart(2, '0')
    const day = String(value.getDate()).padStart(2, '0')
    const hours = String(value.getHours()).padStart(2, '0')
    const minutes = String(value.getMinutes()).padStart(2, '0')
    const seconds = String(value.getSeconds()).padStart(2, '0')
    return `${year}-${month}-${day}-${hours}${minutes}${seconds}`
  }

  const exportJson = () => {
    const blob = new Blob([JSON.stringify({ participants, rounds, results }, null, 2)], {
      type: 'application/json',
    })
    const url = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `wacky-bracket-${formatExportTimestamp(new Date())}.json`
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
      const importErrors = validateTournament(nextParticipants, nextRounds)
      if (importErrors.length > 0) {
        setStatusMessage(`JSON import failed: ${importErrors[0]}`)
        return
      }
      setPendingImport({ participants: nextParticipants, rounds: nextRounds, results: nextResults })
    } catch {
      setStatusMessage('JSON import failed: invalid JSON.')
    }
  }

  const confirmImport = () => {
    if (!pendingImport) return
    setParticipants(pendingImport.participants)
    setRounds(ensureFinalRoundShape(pendingImport.rounds))
    setResults(pendingImport.results)
    setParticipantLines(pendingImport.participants.map((entry) => entry.name).join('\n'))
    setDraftRounds(ensureFinalRoundShape(pendingImport.rounds))
    setPendingImport(null)
    setConfirmModalOpen(false)
    setStatusMessage('Tournament imported from JSON.')
  }

  const cancelImport = () => {
    setPendingImport(null)
  }

  const shuffleParticipantLines = () => {
    setParticipantLines((prev) => shuffleLines(prev))
  }

  const sortParticipantLines = () => {
    setParticipantLines((prev) => sortLines(prev))
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
    draftRounds,
    participantLines,
    statusMessage,
    participantsOpen,
    roundsOpen,
    errors,
    roundStates,
    hasPendingChanges,
    confirmModalOpen,
    confirmResetOpen,
    confirmImportOpen: pendingImport !== null,
    setParticipantLines,
    shuffleParticipantLines,
    sortParticipantLines,
    toggleParticipantsOpen: () => setParticipantsOpen((value) => !value),
    toggleRoundsOpen: () => setRoundsOpen((value) => !value),
    requestApply,
    confirmApply: applyDrafts,
    revertDrafts,
    cancelApply,
    confirmImport,
    cancelImport,
    importCsvFromFile,
    updateHeat,
    addHeat,
    removeHeat,
    addRound,
    removeRound,
    updateRoundLabel,
    setLaps,
    requestReset,
    confirmReset: resetState,
    cancelReset,
    exportJson,
    importJsonFromFile,
    openDisplayPopout,
  }
}
