// LRC parsing & serialization.
// Timestamp formats supported: [mm:ss.xx] [mm:ss.xxx] [mm:ss]

const LRC_TAG = /\[(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?\]/g;

export function parseLyrics(raw) {
  const text = (raw || '').replace(/\r\n?/g, '\n');
  const rawLines = text.split('\n');

  const lines = [];
  let hasTimestamps = false;

  for (const rawLine of rawLines) {
    const matches = [...rawLine.matchAll(LRC_TAG)];
    const content = rawLine.replace(LRC_TAG, '').trim();

    if (matches.length > 0) {
      hasTimestamps = true;
      if (!content) continue; // pure metadata / empty timestamp lines are skipped
      for (const m of matches) {
        const min = parseInt(m[1], 10);
        const sec = parseInt(m[2], 10);
        let frac = m[3] ? m[3] : '0';
        frac = frac.length === 1 ? frac + '00' : frac.length === 2 ? frac + '0' : frac;
        const ms = parseInt(frac, 10);
        const time = min * 60 + sec + ms / 1000;
        lines.push({ time, text: content });
      }
    } else if (content) {
      lines.push({ time: null, text: content });
    }
  }

  lines.sort((a, b) => {
    if (a.time === null && b.time === null) return 0;
    if (a.time === null) return 1;
    if (b.time === null) return -1;
    return a.time - b.time;
  });

  return { lines, hasTimestamps };
}

export function formatTimestamp(t) {
  if (t === null || t === undefined || isNaN(t)) return '';
  const min = Math.floor(t / 60);
  const sec = t - min * 60;
  return `[${String(min).padStart(2, '0')}:${sec.toFixed(2).padStart(5, '0')}]`;
}

export function linesToLRC(lines) {
  return lines
    .filter(l => l.time !== null && l.time !== undefined)
    .sort((a, b) => a.time - b.time)
    .map(l => `${formatTimestamp(l.time)} ${l.text}`)
    .join('\n');
}

// Given current playback time and a sorted lines array, return active index (-1 if before first line / no timestamps).
export function findActiveIndex(lines, currentTime) {
  if (!lines.length) return -1;
  let idx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].time !== null && lines[i].time <= currentTime + 0.001) {
      idx = i;
    } else {
      break;
    }
  }
  return idx;
}
