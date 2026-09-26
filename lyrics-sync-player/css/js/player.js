export class Player {
  constructor(audioEl) {
    this.audio = audioEl;
    this.listeners = {};
    this.audio.addEventListener('timeupdate', () => this.emit('time', this.audio.currentTime));
    this.audio.addEventListener('loadedmetadata', () => this.emit('duration', this.audio.duration));
    this.audio.addEventListener('play', () => this.emit('playstate', true));
    this.audio.addEventListener('pause', () => this.emit('playstate', false));
    this.audio.addEventListener('ended', () => this.emit('ended'));
    this.audio.addEventListener('volumechange', () => this.emit('volume', this.audio.volume));
  }

  on(evt, cb) {
    (this.listeners[evt] ||= []).push(cb);
    return () => { this.listeners[evt] = this.listeners[evt].filter(f => f !== cb); };
  }

  emit(evt, ...args) {
    (this.listeners[evt] || []).forEach(cb => cb(...args));
  }

  loadSrc(url) {
    this.audio.src = url;
    this.audio.load();
  }

  play() { return this.audio.play(); }
  pause() { this.audio.pause(); }
  togglePlay() { return this.audio.paused ? this.play() : Promise.resolve(this.pause()); }
  get isPaused() { return this.audio.paused; }

  seek(time) {
    const t = Math.max(0, Math.min(time, this.audio.duration || time));
    this.audio.currentTime = t;
  }
  seekBy(delta) { this.seek(this.audio.currentTime + delta); }

  get currentTime() { return this.audio.currentTime; }
  get duration() { return this.audio.duration || 0; }

  setVolume(v) { this.audio.volume = Math.max(0, Math.min(1, v)); }
  get volume() { return this.audio.volume; }

  setLoop(v) { this.audio.loop = v; }
  get loop() { return this.audio.loop; }

  toggleMute() {
    this.audio.muted = !this.audio.muted;
    return this.audio.muted;
  }
}

export function formatTime(sec) {
  if (!isFinite(sec) || sec < 0) sec = 0;
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}
