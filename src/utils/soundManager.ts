// src/utils/soundManager.ts

export type SoundEvent =
  | 'playerJoin'
  | 'playerLeave'
  | 'correctGuessSelf'
  | 'correctGuessOther'
  | 'wordSelectionShow'
  | 'hintShow'
  | 'roundStart'
  | 'roundEnd'
  | 'buttonClick'
  | 'chatMessage'
  | 'notification';

export const SOUND_MANIFEST: Record<SoundEvent, string> = {
  playerJoin: '/sounds/room/join.wav',
  playerLeave: '/sounds/room/leave.wav',
  correctGuessSelf: '/sounds/game/correct-self.wav',
  correctGuessOther: '/sounds/game/correct-other.wav',
  wordSelectionShow: '/sounds/game/word-selection.wav',
  hintShow: '/sounds/game/hint.wav',
  roundStart: '/sounds/game/round-start.wav',
  roundEnd: '/sounds/game/round-end.wav',
  buttonClick: '/sounds/ui/button.wav',
  chatMessage: '/sounds/ui/chat.wav',
  notification: '/sounds/ui/notification.wav',
};

class SoundManager {
  private context: AudioContext | null = null;
  private buffers: Map<string, AudioBuffer> = new Map();
  private isMuted: boolean = false;
  private lastPlayTimes: Map<string, number> = new Map();
  private unlocked: boolean = false;

  // Throttling configuration to prevent sound storms (ms)
  private throttleTimes: Record<string, number> = {
    chatMessage: 100,
    playerJoin: 500,
    playerLeave: 500,
    buttonClick: 50,
  };

  constructor() {
    if (typeof window !== 'undefined') {
      this.isMuted = localStorage.getItem('gartic_muted') === 'true';
      this.initContext();
    }
  }

  private initContext() {
    if (this.context) return;
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioContextClass) {
        this.context = new AudioContextClass();
      }
    } catch (e) {
      console.error('SoundManager: Failed to create AudioContext', e);
    }
  }

  /**
   * Must be called on first user interaction (click, touch) to unlock audio on iOS
   */
  public unlock() {
    if (this.unlocked || !this.context) return;

    try {
      // Resume context if suspended
      if (this.context.state === 'suspended') {
        this.context.resume();
      }

      // Play silent buffer to unlock the audio context
      const buffer = this.context.createBuffer(1, 1, 22050);
      const source = this.context.createBufferSource();
      source.buffer = buffer;
      source.connect(this.context.destination);
      source.start(0);

      this.unlocked = true;
      console.log('SoundManager: AudioContext unlocked.');
    } catch (e) {
      console.error('SoundManager: Failed to unlock AudioContext', e);
    }
  }

  /**
   * Loads a sound from a URL and decodes it into memory
   */
  public async loadSound(name: SoundEvent, url: string) {
    if (this.buffers.has(name) || !this.context) return;
    try {
      const response = await fetch(url);
      if (!response.ok) {
        // Return silently if the file is not found (e.g. 404). This prevents custom console errors.
        return;
      }
      const arrayBuffer = await response.arrayBuffer();
      const buffer = await this.context.decodeAudioData(arrayBuffer);
      this.buffers.set(name, buffer);
    } catch (e) {
      // Only log if something went wrong during decoding a valid response
      console.error(`SoundManager: Failed to decode sound ${name} from ${url}`, e);
    }
  }

  /**
   * Loads all sounds defined in SOUND_MANIFEST
   */
  public async loadAll() {
    const promises = Object.entries(SOUND_MANIFEST).map(([name, url]) => {
      return this.loadSound(name as SoundEvent, url);
    });
    await Promise.all(promises);
  }

  /**
   * Plays a pre-loaded sound by name
   */
  public play(name: SoundEvent, volume: number = 1.0) {
    if (this.isMuted || !this.context || !this.buffers.has(name)) return;

    const now = Date.now();
    const throttleTime = this.throttleTimes[name] || 50;
    const lastPlay = this.lastPlayTimes.get(name) || 0;

    // Prevent sounds from overlapping too closely and causing a loud "storm"
    if (now - lastPlay < throttleTime) {
      return;
    }

    this.lastPlayTimes.set(name, now);

    try {
      if (this.context.state === 'suspended') {
        this.context.resume();
      }

      const source = this.context.createBufferSource();
      source.buffer = this.buffers.get(name)!;

      const gainNode = this.context.createGain();
      gainNode.gain.value = volume;

      source.connect(gainNode);
      gainNode.connect(this.context.destination);

      source.start(0);
    } catch (e) {
      console.error(`SoundManager: Error playing sound ${name}`, e);
    }
  }

  public setMuted(muted: boolean) {
    this.isMuted = muted;
    if (typeof window !== 'undefined') {
      localStorage.setItem('gartic_muted', muted ? 'true' : 'false');
    }
  }

  public toggleMuted() {
    this.setMuted(!this.isMuted);
    return this.isMuted;
  }
  
  public getMuted() {
    return this.isMuted;
  }
}

export const soundManager = new SoundManager();
