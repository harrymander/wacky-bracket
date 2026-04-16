import { useMemo } from 'react'
import './App.css'
import { BracketPanel } from './components/BracketPanel'
import { SetupPanel } from './components/SetupPanel'
import { useTournamentState } from './hooks/useTournamentState'

function App() {
  const isDisplayMode = useMemo(() => {
    const query = new URLSearchParams(window.location.search)
    return query.get('view') === 'display'
  }, [])

  const state = useTournamentState()

  return (
    <main className={`app ${isDisplayMode ? 'display-mode' : ''}`}>
      <header className="page-header">
        <h1>Wacky Racers</h1>
      </header>

      {!isDisplayMode ? (
        <section className="panel">
          <SetupPanel
            rounds={state.rounds}
            participantLines={state.participantLines}
            participantsOpen={state.participantsOpen}
            roundsOpen={state.roundsOpen}
            statusMessage={state.statusMessage}
            errors={state.errors}
            onExportJson={state.exportJson}
            onImportJsonFromFile={state.importJsonFromFile}
            onResetState={state.resetState}
            onToggleParticipantsOpen={state.toggleParticipantsOpen}
            onToggleRoundsOpen={state.toggleRoundsOpen}
            onParticipantLinesChange={state.setParticipantLines}
            onApplyParticipants={state.applyParticipants}
            onImportCsvFromFile={state.importCsvFromFile}
            onAddRound={state.addRound}
            onRemoveRound={state.removeRound}
            onAddHeat={state.addHeat}
            onRemoveHeat={state.removeHeat}
            onUpdateRoundLabel={state.updateRoundLabel}
            onUpdateHeat={state.updateHeat}
          />
        </section>
      ) : null}

      <section className="panel">
        {!isDisplayMode ? (
          <div className="panel-header">
            <h2>Bracket</h2>
            <button type="button" className="ghost display-button" onClick={state.openDisplayPopout}>
              Display
            </button>
          </div>
        ) : null}
        <BracketPanel
          roundStates={state.roundStates}
          results={state.results}
          isDisplayMode={isDisplayMode}
          onSetLaps={state.setLaps}
        />
      </section>
    </main>
  )
}

export default App
