// BPM always measures the main beat. Count-in always uses quarter notes.
export function metronomeIntervalMs(bpm: number, subdivision: number, countIn = false): number {
  return 60000 / bpm / (countIn ? 1 : subdivision);
}

export function metronomeClick(tick: number, subdivision: number, countIn = false) {
  const notesPerBeat = countIn ? 1 : subdivision;
  const main = tick % notesPerBeat === 0;
  const accent = tick % (4 * notesPerBeat) === 0;
  return {
    frequency: accent ? 1600 : main ? 1000 : 700,
    volume: accent ? 0.25 : main ? 0.15 : 0.07,
  };
}
