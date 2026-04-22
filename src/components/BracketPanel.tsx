import { useState } from 'react'
import { evaluateHeatLaps, type RoundState, type TournamentResults } from '../lib/tournament'

type BracketPanelProps = {
  roundStates: RoundState[]
  results: TournamentResults
  isDisplayMode: boolean
  onSetLaps: (roundId: string, heatId: string, participantId: string, value: string) => void
}

const buildDestinationHeatMap = (roundStates: RoundState[], roundIndex: number) => {
  const map = new Map<string, number>()
  if (roundIndex >= roundStates.length - 1) {
    return map
  }

  const currentRound = roundStates[roundIndex]
  const nextRound = roundStates[roundIndex + 1]

  const destinationHeatSlots: number[] = []
  nextRound.heats.forEach((heat, nextHeatIndex) => {
    for (let i = 0; i < heat.participantSlots; i += 1) {
      destinationHeatSlots.push(nextHeatIndex + 1)
    }
  })

  let cursor = 0
  currentRound.heats.forEach((heat, heatIndex) => {
    for (let rank = 1; rank <= heat.advanceCount; rank += 1) {
      const destinationHeat = destinationHeatSlots[cursor]
      if (destinationHeat !== undefined) {
        map.set(`${heatIndex}-${rank}`, destinationHeat)
      }
      cursor += 1
    }
  })

  return map
}

const buildAllHeatKeys = (roundStates: RoundState[]) =>
  roundStates.flatMap((round) => round.heats.map((heat) => `${round.id}:${heat.id}`))

export const BracketPanel = ({ roundStates, results, isDisplayMode, onSetLaps }: BracketPanelProps) => (
  <BracketPanelContent
    key={isDisplayMode ? 'display-mode' : 'edit-mode'}
    roundStates={roundStates}
    results={results}
    isDisplayMode={isDisplayMode}
    onSetLaps={onSetLaps}
  />
)

const BracketPanelContent = ({ roundStates, results, isDisplayMode, onSetLaps }: BracketPanelProps) => {
  const [expandedHeatKey, setExpandedHeatKey] = useState<string | null>(null)
  const [expandedRoundId, setExpandedRoundId] = useState<string | null>(null)
  const [collapsedHeatKeys, setCollapsedHeatKeys] = useState<Set<string>>(
    () => (isDisplayMode ? new Set(buildAllHeatKeys(roundStates)) : new Set()),
  )

  return (
    <div className={`round-lane ${expandedHeatKey || expandedRoundId ? 'focus-mode' : ''}`}>
      {roundStates.map((round, roundIndex) => {
        if (expandedRoundId !== null && expandedRoundId !== round.id) {
          return null
        }

        const visibleHeats =
          expandedHeatKey === null ? round.heats : round.heats.filter((heat) => `${round.id}:${heat.id}` === expandedHeatKey)
        if (visibleHeats.length === 0) {
          return null
        }

        const destinationHeatMap = buildDestinationHeatMap(roundStates, roundIndex)
        const isRoundExpanded = expandedRoundId === round.id
        const roundHeatKeys = round.heats.map((heat) => `${round.id}:${heat.id}`)
        const allRoundHeatsCollapsed = roundHeatKeys.every((heatKey) => collapsedHeatKeys.has(heatKey))
        const allRoundHeatsExpanded = roundHeatKeys.every((heatKey) => !collapsedHeatKeys.has(heatKey))

        return (
          <article key={round.id} className={`round-card ${expandedHeatKey || isRoundExpanded ? 'focus-mode' : ''}`}>
            <header className="round-header">
              <h3>{round.label}</h3>
              {!expandedHeatKey ? (
                <div className="round-bulk-controls">
                  <button
                    type="button"
                    className="ghost round-bulk-button expand-all"
                    aria-label="Expand all heats"
                    title="Expand all heats"
                    disabled={allRoundHeatsExpanded}
                    onClick={() =>
                      setCollapsedHeatKeys((current) => {
                        const next = new Set(current)
                        roundHeatKeys.forEach((heatKey) => next.delete(heatKey))
                        return next
                      })
                    }
                  />
                  <button
                    type="button"
                    className="ghost round-bulk-button collapse-all"
                    aria-label="Collapse all heats"
                    title="Collapse all heats"
                    disabled={allRoundHeatsCollapsed}
                    onClick={() =>
                      setCollapsedHeatKeys((current) => {
                        const next = new Set(current)
                        roundHeatKeys.forEach((heatKey) => next.add(heatKey))
                        return next
                      })
                    }
                  />
                </div>
              ) : null}
              {!expandedHeatKey ? (
                <button
                  type="button"
                  className={`ghost round-focus-button ${isRoundExpanded ? 'compress' : 'expand'}`}
                  aria-label={isRoundExpanded ? 'Minimise round' : 'Expand round'}
                  title={isRoundExpanded ? 'Minimise round' : 'Expand round'}
                  onClick={() => {
                    setExpandedRoundId(isRoundExpanded ? null : round.id)
                    if (!isRoundExpanded) {
                      setExpandedHeatKey(null)
                    }
                  }}
                />
              ) : null}
              {!expandedHeatKey && roundIndex < roundStates.length - 1 ? (
                <p>{visibleHeats.length} heat{visibleHeats.length === 1 ? '' : 's'}</p>
              ) : null}
            </header>

            {!isDisplayMode
              ? round.messages.map((message) => (
                  <p key={message} className="warn">
                    {message}
                  </p>
                ))
              : null}

            {visibleHeats.map((heat) => {
              const ranking = evaluateHeatLaps(heat, results?.[round.id]?.[heat.id])
              const rankByParticipantId = new Map(
                ranking.ranked
                  .map((entry) => {
                    const id = entry.entrant.participant?.id
                    return id ? ([id, entry.rank] as const) : null
                  })
                  .filter((value): value is readonly [string, number] => value !== null),
              )
              const orderedEntrants = [...heat.entrants].sort((a, b) => {
                if (!isDisplayMode) {
                  return 0
                }
                const rankA = a.participant ? (rankByParticipantId.get(a.participant.id) ?? Number.MAX_SAFE_INTEGER) : Number.MAX_SAFE_INTEGER
                const rankB = b.participant ? (rankByParticipantId.get(b.participant.id) ?? Number.MAX_SAFE_INTEGER) : Number.MAX_SAFE_INTEGER
                return rankA - rankB
              })
              const originalHeatIndex = round.heats.findIndex((candidate) => candidate.id === heat.id)
              const heatKey = `${round.id}:${heat.id}`
              const isExpanded = expandedHeatKey === heatKey
              const isCollapsed = !isExpanded && collapsedHeatKeys.has(heatKey)
              const isCompleted = ranking.isComplete

              return (
                <section
                  key={heat.id}
                  className={`heat-card ${isExpanded ? 'focus-mode' : ''} ${isCollapsed ? 'collapsed' : ''} ${isCollapsed && isCompleted ? 'complete' : ''}`}
                >
                  <div className="heat-header">
                    {roundIndex < roundStates.length - 1 ? <h4>{heat.label}</h4> : <h4>{round.label}</h4>}
                    <div className="heat-header-controls">
                      {!isExpanded ? (
                        <button
                          type="button"
                          className={`ghost heat-collapse-button ${isCollapsed ? 'expand' : 'collapse'}`}
                          aria-label={isCollapsed ? 'Expand heat' : 'Collapse heat'}
                          title={isCollapsed ? 'Expand heat' : 'Collapse heat'}
                          onClick={() =>
                            setCollapsedHeatKeys((current) => {
                              const next = new Set(current)
                              if (next.has(heatKey)) {
                                next.delete(heatKey)
                              } else {
                                next.add(heatKey)
                              }
                              return next
                            })
                          }
                        />
                      ) : null}
                      <button
                        type="button"
                        className={`ghost heat-focus-button ${isExpanded ? 'compress' : 'expand'}`}
                        aria-label={isExpanded ? 'Minimise heat' : 'Maximise heat'}
                        title={isExpanded ? 'Minimise heat' : 'Maximise heat'}
                        onClick={() => setExpandedHeatKey(isExpanded ? null : heatKey)}
                      />
                    </div>
                  </div>
                  {!isCollapsed ? (
                    <>
                      {isDisplayMode ? (
                        <div className="laps-column-header" aria-hidden="true">
                          <span />
                          <span>Laps</span>
                        </div>
                      ) : null}
                      {orderedEntrants.map((entrant, entrantIndex) => {
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
                          ranking.actualAdvancers.some((p) => p.id === participant?.id)
                        const rankingEntry = participant
                          ? ranking.ranked.find((entry) => entry.entrant.participant?.id === participant.id)
                          : null
                        const advancingRank = rankingEntry ? rankingEntry.rank : 0

                        // Map extra advancers (from boundary ties) to the destination of the last qualifying rank
                        const mappingRank = Math.min(advancingRank, heat.advanceCount)
                        const destinationHeat =
                          isAdvancing && roundIndex < roundStates.length - 1 && mappingRank > 0
                            ? destinationHeatMap.get(`${originalHeatIndex}-${mappingRank}`)
                            : undefined
                        const isFinalRound = roundIndex === roundStates.length - 1
                        const medalRank =
                          advancingRank >= 1 && advancingRank <= 3 && (destinationHeat !== undefined || isFinalRound)
                            ? advancingRank
                            : 0
                        const displayRank = isDisplayMode && participant && advancingRank > 0 ? advancingRank : null

                        return (
                          <div
                            key={`${heat.id}-slot-${entrantIndex}-${participant?.id ?? 'unassigned'}`}
                            className={`entrant-row ${isAdvancing ? 'advancing' : ''}`}
                          >
                            <span className="entrant-label">
                              {isDisplayMode ? (
                                displayRank && displayRank <= 3 ? (
                                  <span className={`medal-badge medal-${displayRank} rank-marker`} aria-label={`${displayRank} place`}>
                                    {displayRank}
                                  </span>
                                ) : (
                                  <span className="rank-badge rank-marker">{displayRank ?? '-'}</span>
                                )
                              ) : null}
                              <span>{participant ? participant.name : placeholder}</span>
                              {destinationHeat ? (
                                <span className="next-destination">
                                  {roundIndex + 1 === roundStates.length - 1 ? `→ F` : `→ R${roundIndex + 2} H${destinationHeat}`}
                                </span>
                              ) : null}
                            </span>
                            <span className="value-with-medal">
                              {!isDisplayMode && medalRank ? (
                                <span className={`medal-badge medal-${medalRank}`} aria-label={`${medalRank} place`}>
                                  {medalRank}
                                </span>
                              ) : null}
                              {isDisplayMode ? (
                                <span className="lap-value">{participant ? currentValue || '-' : '-'}</span>
                              ) : (
                                <input
                                  type="number"
                                  name={`laps-${round.id}-${heat.id}-${participant?.id ?? `slot-${entrantIndex}`}`}
                                  min={0}
                                  step={0.25}
                                  disabled={!participant}
                                  value={currentValue}
                                  placeholder={participant ? 'Laps' : '-'}
                                  onChange={(event) => participant && onSetLaps(round.id, heat.id, participant.id, event.target.value)}
                                />
                              )}
                            </span>
                          </div>
                        )
                      })}
                      {!isDisplayMode && ranking.hasTieInTop && !ranking.hasTie ? (
                        <p className="warn">Ties detected among qualifying positions.</p>
                      ) : null}
                      {!isDisplayMode && ranking.hasTie ? (
                        <p className="warn">Boundary tie: extra participants will advance.</p>
                      ) : null}
                    </>
                  ) : null}
                </section>
              )
            })}
            {!isDisplayMode && roundIndex < roundStates.length - 1 && !round.canAdvance ? (
              <p className="locked">Next round stays locked until all lap totals are valid.</p>
            ) : null}
          </article>
        )
      })}
    </div>
  )
}
