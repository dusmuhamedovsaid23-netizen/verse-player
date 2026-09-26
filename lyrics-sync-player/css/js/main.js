import { SongDB, Settings, uid } from './db.js';
import { parseLyrics, linesToLRC } from './lrc.js';
import { Player, formatTime } from './player.js';
import { LyricsView, BackgroundView } from './ui.js';

// ---------- DOM refs ----------
const $ = (sel) => document.querySelector(sel);

const audioEl = $('#audio');
const player = new Player(audioEl);

const lyricsView = new LyricsView({
  listEl: $('#lyrics-list'),
  viewportEl: $('#lyrics-viewport'),
  emptyStateEl: $('#empty-state'),
  onLineClick: (line) => {
    if (state.syncMode) return;
    if (line.time !== null && line.time !== undefined) player.seek(line.time);
  }
});

const backgroundView = new BackgroundView({ imageEl: $('#bg-image') });

const els = {
  trackTitle: $('#track-title'),
  trackArtist: $('#track-artist'),
  coverArt: $('#cover-art'),
  coverFallback: $('#cover-fallback'),
  seek: $('#seek'),
  timeCurrent: $('#time-current'),
  timeTotal: $('#time-total'),
  btnPlay: $('#btn-play'),
  iconPlay: $('#icon-play'),
  iconPause: $('#icon-pause'),
  btnLoop: $('#btn-loop'),
  btnBack10: $('#btn-back10'),
  btnFwd10: $('#btn-fwd10'),
  volume: $('#volume'),
  btnMute: $('#btn-mute'),
  playerBar: $('#player-bar'),
  btnHidePlayer: $('#btn-hide-player'),
  btnShowPlayer: $('#btn-show-player'),
  btnFullscreen: $('#btn-fullscreen'),
  app: $('#app'),

  btnUpload: $('#btn-upload'),
  btnUploadEmpty: $('#btn-upload-empty'),
  uploadModal: $('#upload-modal'),
  btnCloseUpload: $('#btn-close-upload'),
  dropAudio: $('#drop-audio'),
  dropCover: $('#drop-cover'),
  inputAudio: $('#input-audio'),
  inputCover: $('#input-cover'),
  dropAudioName: $('#drop-audio-name'),
  dropCoverName: $('#drop-cover-name'),
  inputTitle: $('#input-title'),
  inputArtist: $('#input-artist'),
  inputLyrics: $('#input-lyrics'),
  btnLoadDemo: $('#btn-load-demo'),
  btnConfirmUpload: $('#btn-confirm-upload'),

  btnLibrary: $('#btn-library'),
  libraryModal: $('#library-modal'),
  btnCloseLibrary: $('#btn-close-library'),
  libraryList: $('#library-list'),

  btnSettings: $('#btn-settings'),
  settingsModal: $('#settings-modal'),
  btnCloseSettings: $('#btn-close-settings'),
  settingFontsize: $('#setting-fontsize'),
  settingFont: $('#setting-font'),
  settingSpeed: $('#setting-speed'),
  btnResync: $('#btn-resync'),
  btnClearData: $('#btn-clear-data'),

  syncBar: $('#sync-bar'),
  syncLineIndex: $('#sync-line-index'),
  syncLineTotal: $('#sync-line-total'),
  syncCurrentText: $('#sync-current-text'),
  btnSyncMark: $('#btn-sync-mark'),
  btnSyncBack: $('#btn-sync-back'),
  btnSyncSkip: $('#btn-sync-skip'),
  btnSyncDone: $('#btn-sync-done'),
};

// ---------- App state ----------
const state = {
  song: null,          // current song record
  audioUrl: null,
  coverUrl: null,
  syncMode: false,
  syncIndex: 0,
  syncLines: [],
  isSeeking: false,
};

// ---------- Settings ----------
function applySettings(s) {
  const root = document.documentElement;
  if (s.fontSize) { root.style.setProperty('--lyrics-size', s.fontSize + 'px'); els.settingFontsize.value = s.fontSize; }
  if (s.fontFamily) { root.style.setProperty('--lyrics-font', s.fontFamily); els.settingFont.value = s.fontFamily; }
  if (s.animSpeed) { root.style.setProperty('--anim-speed', s.animSpeed); els.settingSpeed.value = s.animSpeed; }
  if (typeof s.volume === 'number') { player.setVolume(s.volume); els.volume.value = Math.round(s.volume * 100); }
  if (typeof s.loop === 'boolean') { player.setLoop(s.loop); els.btnLoop.style.color = s.loop ? 'var(--accent)' : ''; }
}

const savedSettings = Settings.load();
applySettings({
  fontSize: savedSettings.fontSize || 30,
  fontFamily: savedSettings.fontFamily || "'Manrope', sans-serif",
  animSpeed: savedSettings.animSpeed || 1,
  volume: savedSettings.volume ?? 0.8,
  loop: savedSettings.loop || false,
});

els.settingFontsize.addEventListener('input', () => {
  const v = els.settingFontsize.value;
  document.documentElement.style.setProperty('--lyrics-size', v + 'px');
  Settings.save({ fontSize: Number(v) });
});
els.settingFont.addEventListener('change', () => {
  document.documentElement.style.setProperty('--lyrics-font', els.settingFont.value);
  Settings.save({ fontFamily: els.settingFont.value });
});
els.settingSpeed.addEventListener('input', () => {
  document.documentElement.style.setProperty('--anim-speed', els.settingSpeed.value);
  Settings.save({ animSpeed: Number(els.settingSpeed.value) });
});

// ---------- Modal helpers ----------
function openModal(el) {
  el.hidden = false;
  // force a reflow so the transition to .is-open actually animates
  void el.offsetWidth;
  el.classList.add('is-open');
}
function closeModal(el) {
  el.classList.remove('is-open');
  const onEnd = (e) => {
    if (e.target !== el) return;
    el.hidden = true;
    el.removeEventListener('transitionend', onEnd);
  };
  el.addEventListener('transitionend', onEnd);
  // safety fallback in case transitionend doesn't fire
  setTimeout(() => { el.hidden = true; }, 400);
}

document.querySelectorAll('.modal-backdrop').forEach(backdrop => {
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) closeModal(backdrop); });
});

els.btnUpload.addEventListener('click', () => openModal(els.uploadModal));
els.btnUploadEmpty.addEventListener('click', () => openModal(els.uploadModal));
els.btnCloseUpload.addEventListener('click', () => closeModal(els.uploadModal));

els.btnLibrary.addEventListener('click', async () => { await renderLibrary(); openModal(els.libraryModal); });
els.btnCloseLibrary.addEventListener('click', () => closeModal(els.libraryModal));

els.btnSettings.addEventListener('click', () => openModal(els.settingsModal));
els.btnCloseSettings.addEventListener('click', () => closeModal(els.settingsModal));

// ---------- Upload flow ----------
let pendingAudioFile = null;
let pendingCoverFile = null;

function setupDropZone(zoneEl, inputEl, nameEl, accept) {
  zoneEl.addEventListener('click', (e) => { if (e.target !== inputEl) inputEl.click(); });
  zoneEl.addEventListener('dragover', (e) => { e.preventDefault(); zoneEl.classList.add('has-file'); });
  zoneEl.addEventListener('dragleave', () => zoneEl.classList.remove('has-file'));
  zoneEl.addEventListener('drop', (e) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) { inputEl.files = e.dataTransfer.files; handleFile(file); }
  });
  inputEl.addEventListener('change', () => {
    const file = inputEl.files[0];
    if (file) handleFile(file);
  });
  function handleFile(file) {
    zoneEl.classList.add('has-file');
    nameEl.textContent = file.name;
    if (inputEl === els.inputAudio) pendingAudioFile = file;
    else pendingCoverFile = file;
  }
}
setupDropZone(els.dropAudio, els.inputAudio, els.dropAudioName, 'audio/*');
setupDropZone(els.dropCover, els.inputCover, els.dropCoverName, 'image/*');

els.btnLoadDemo.addEventListener('click', async () => {
  try {
    const [audioRes, lrcRes] = await Promise.all([
      fetch('demo/demo-track.mp3'),
      fetch('demo/demo.lrc')
    ]);
    pendingAudioFile = new File([await audioRes.blob()], 'demo-track.mp3', { type: 'audio/mpeg' });
    pendingCoverFile = null;
    els.dropAudioName.textContent = 'demo-track.mp3';
    els.dropAudio.classList.add('has-file');
    els.inputTitle.value = 'Демо-трек';
    els.inputArtist.value = 'Verse Demo';
    els.inputLyrics.value = await lrcRes.text();
  } catch (err) {
    alert('Не удалось загрузить демо. Убедитесь, что сайт запущен через локальный сервер (см. README).');
  }
});

els.btnConfirmUpload.addEventListener('click', async () => {
  if (!pendingAudioFile) { alert('Выберите аудиофайл.'); return; }

  const lyricsRaw = els.inputLyrics.value.trim();
  const { lines, hasTimestamps } = parseLyrics(lyricsRaw);

  const song = {
    id: uid(),
    title: els.inputTitle.value.trim() || pendingAudioFile.name.replace(/\.[^/.]+$/, ''),
    artist: els.inputArtist.value.trim() || 'Неизвестный исполнитель',
    audioBlob: pendingAudioFile,
    coverBlob: pendingCoverFile,
    lyricsRaw,
    lines,
    hasTimestamps,
    updatedAt: Date.now(),
  };

  await SongDB.saveSong(song);
  Settings.setLastSongId(song.id);
  closeModal(els.uploadModal);
  resetUploadForm();
  await loadSong(song);

  if (!hasTimestamps && lines.length) {
    startSyncMode(song.lines);
  }
});

function resetUploadForm() {
  pendingAudioFile = null;
  pendingCoverFile = null;
  els.inputAudio.value = '';
  els.inputCover.value = '';
  els.dropAudioName.textContent = 'MP3, WAV, OGG — перетащите или выберите';
  els.dropCoverName.textContent = 'JPG, PNG — необязательно';
  els.dropAudio.classList.remove('has-file');
  els.dropCover.classList.remove('has-file');
  els.inputTitle.value = '';
  els.inputArtist.value = '';
  els.inputLyrics.value = '';
}

// ---------- Library ----------
async function renderLibrary() {
  const songs = await SongDB.getAllSongs();
  els.libraryList.innerHTML = '';
  if (!songs.length) {
    els.libraryList.innerHTML = '<div class="library-empty">Пока нет сохранённых песен</div>';
    return;
  }
  for (const song of songs) {
    const item = document.createElement('div');
    item.className = 'library-item';

    let thumbHtml = `<div class="lib-fallback">🎵</div>`;
    if (song.coverBlob) {
      const url = URL.createObjectURL(song.coverBlob);
      thumbHtml = `<img src="${url}" alt="">`;
    }

    item.innerHTML = `
      ${thumbHtml}
      <div class="lib-meta">
        <div class="lib-title">${escapeHtml(song.title)}</div>
        <div class="lib-artist">${escapeHtml(song.artist)}</div>
      </div>
      <button class="icon-btn lib-delete" aria-label="Удалить">✕</button>
    `;
    item.addEventListener('click', async (e) => {
      if (e.target.closest('.lib-delete')) return;
      closeModal(els.libraryModal);
      await loadSong(song);
    });
    item.querySelector('.lib-delete').addEventListener('click', async (e) => {
      e.stopPropagation();
      await SongDB.deleteSong(song.id);
      renderLibrary();
    });
    els.libraryList.appendChild(item);
  }
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ---------- Load / play a song ----------
async function loadSong(song) {
  state.song = song;
  state.syncMode = false;
  els.syncBar.hidden = true;

  if (state.audioUrl) URL.revokeObjectURL(state.audioUrl);
  state.audioUrl = URL.createObjectURL(song.audioBlob);
  player.loadSrc(state.audioUrl);

  if (state.coverUrl) URL.revokeObjectURL(state.coverUrl);
  if (song.coverBlob) {
    state.coverUrl = URL.createObjectURL(song.coverBlob);
    els.coverArt.style.backgroundImage = `url(${state.coverUrl})`;
    els.coverFallback.style.display = 'none';
    backgroundView.setCover(state.coverUrl);
  } else {
    state.coverUrl = null;
    els.coverArt.style.backgroundImage = '';
    els.coverFallback.style.display = '';
    backgroundView.setCover(null);
  }

  els.trackTitle.textContent = song.title;
  els.trackArtist.textContent = song.artist;
  lyricsView.setLines(song.lines || []);

  Settings.setLastSongId(song.id);
}

// ---------- Manual sync mode ----------
function startSyncMode(lines) {
  // Build a working list preserving text order; assign times as user marks them.
  state.syncMode = true;
  state.syncIndex = 0;
  state.syncLines = lines.map(l => ({ text: l.text, time: null }));
  els.syncBar.hidden = false;
  els.syncLineTotal.textContent = String(state.syncLines.length);
  updateSyncUI();
  lyricsView.setLines(state.syncLines);
  lyricsView.highlightForSync(0);
  player.seek(0);
}

function updateSyncUI() {
  const cur = state.syncLines[state.syncIndex];
  els.syncLineIndex.textContent = String(state.syncIndex + 1);
  els.syncCurrentText.textContent = cur ? cur.text : '—';
}

function markSyncLine() {
  if (!state.syncMode) return;
  const cur = state.syncLines[state.syncIndex];
  if (cur) cur.time = player.currentTime;
  advanceSync(1);
}

function advanceSync(delta) {
  const next = state.syncIndex + delta;
  if (next < 0) return;
  if (next >= state.syncLines.length) { finishSyncMode(); return; }
  state.syncIndex = next;
  updateSyncUI();
  lyricsView.highlightForSync(state.syncIndex);
}

async function finishSyncMode() {
  state.syncMode = false;
  els.syncBar.hidden = true;

  // Fill any un-marked lines by interpolation so nothing has a null time.
  const lines = state.syncLines;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].time === null) {
      const prevTimed = [...lines.slice(0, i)].reverse().find(l => l.time !== null);
      const nextTimed = lines.slice(i + 1).find(l => l.time !== null);
      if (prevTimed && nextTimed) {
        lines[i].time = prevTimed.time + (nextTimed.time - prevTimed.time) / 2;
      } else if (prevTimed) {
        lines[i].time = prevTimed.time + 2;
      } else {
        lines[i].time = i * 2;
      }
    }
  }

  if (state.song) {
    state.song.lines = lines;
    state.song.lyricsRaw = linesToLRC(lines);
    state.song.hasTimestamps = true;
    state.song.updatedAt = Date.now();
    await SongDB.saveSong(state.song);
  }
  lyricsView.setLines(lines);
}

els.btnSyncMark.addEventListener('click', markSyncLine);
els.btnSyncSkip.addEventListener('click', () => advanceSync(1));
els.btnSyncBack.addEventListener('click', () => advanceSync(-1));
els.btnSyncDone.addEventListener('click', finishSyncMode);

els.btnResync.addEventListener('click', () => {
  if (!state.song || !state.song.lines || !state.song.lines.length) {
    alert('Сначала загрузите песню с текстом.');
    return;
  }
  closeModal(els.settingsModal);
  startSyncMode(state.song.lines);
});

els.btnClearData.addEventListener('click', async () => {
  if (!confirm('Удалить все сохранённые песни из этого браузера?')) return;
  await SongDB.clearAll();
  Settings.setLastSongId('');
  location.reload();
});

// ---------- Player controls ----------
function updatePlayIcon() {
  const playing = !player.isPaused;
  els.iconPlay.hidden = playing;
  els.iconPause.hidden = !playing;
}

els.btnPlay.addEventListener('click', () => player.togglePlay());
player.on('playstate', updatePlayIcon);

els.btnBack10.addEventListener('click', () => player.seekBy(-10));
els.btnFwd10.addEventListener('click', () => player.seekBy(10));

els.btnLoop.addEventListener('click', () => {
  const loop = !player.loop;
  player.setLoop(loop);
  els.btnLoop.style.color = loop ? 'var(--accent)' : '';
  Settings.save({ loop });
});

els.volume.addEventListener('input', () => {
  const v = els.volume.value / 100;
  player.setVolume(v);
  Settings.save({ volume: v });
});
els.btnMute.addEventListener('click', () => {
  const muted = player.toggleMute();
  els.btnMute.style.opacity = muted ? '0.4' : '';
});

player.on('duration', (d) => { els.timeTotal.textContent = formatTime(d); });
player.on('time', (t) => {
  if (!state.isSeeking) {
    const d = player.duration || 1;
    els.seek.value = String(Math.round((t / d) * 1000));
    els.timeCurrent.textContent = formatTime(t);
  }
  if (!state.syncMode) lyricsView.updateActive(t);
});

els.seek.addEventListener('input', () => { state.isSeeking = true; });
els.seek.addEventListener('change', () => {
  const d = player.duration || 0;
  const t = (els.seek.value / 1000) * d;
  player.seek(t);
  state.isSeeking = false;
});

els.btnHidePlayer.addEventListener('click', () => {
  els.playerBar.classList.add('is-hidden');
  els.btnShowPlayer.hidden = false;
});
els.btnShowPlayer.addEventListener('click', () => {
  els.playerBar.classList.remove('is-hidden');
  els.btnShowPlayer.hidden = true;
});

// ---------- Fullscreen (lyrics-focused UI mode) ----------
els.btnFullscreen.addEventListener('click', () => {
  els.app.classList.toggle('is-fullscreen');
  if (document.fullscreenEnabled) {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen?.().catch(() => {});
    else document.exitFullscreen?.().catch(() => {});
  }
});

// ---------- Keyboard shortcuts ----------
window.addEventListener('keydown', (e) => {
  const tag = (e.target.tagName || '').toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return;

  if (state.syncMode) {
    if (e.code === 'Enter' || e.code === 'NumpadEnter') { e.preventDefault(); markSyncLine(); }
    if (e.code === 'ArrowRight') { e.preventDefault(); advanceSync(1); }
    if (e.code === 'ArrowLeft') { e.preventDefault(); advanceSync(-1); }
    if (e.code === 'Space') { e.preventDefault(); player.togglePlay(); }
    return;
  }

  if (e.code === 'Space') { e.preventDefault(); player.togglePlay(); }
  if (e.code === 'ArrowRight') { e.preventDefault(); player.seekBy(10); }
  if (e.code === 'ArrowLeft') { e.preventDefault(); player.seekBy(-10); }
});

// ---------- Resize handling ----------
let resizeRaf = null;
window.addEventListener('resize', () => {
  if (resizeRaf) cancelAnimationFrame(resizeRaf);
  resizeRaf = requestAnimationFrame(() => {
    const idx = lyricsView.activeIndex;
    const el = lyricsView.lineEls[idx];
    if (el) lyricsView.scrollToCenter(el);
  });
});

// ---------- Boot: restore last song ----------
(async function boot() {
  const lastId = Settings.getLastSongId();
  if (lastId) {
    try {
      const song = await SongDB.getSong(lastId);
      if (song) await loadSong(song);
    } catch (err) { console.warn('Could not restore last song', err); }
  }
})();
