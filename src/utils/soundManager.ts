// src/utils/soundManager.ts

import { SOUND_CONFIG, SoundEvent } from './soundConfig';

class SoundManager {
  private context: AudioContext | null = null;
  private buffers: Map<string, AudioBuffer> = new Map();
  private isMuted: boolean = false;
  private lastPlayTimes: Map<string, number> = new Map();
  private unlocked: boolean = false;

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
   * Loads all sounds defined in SOUND_CONFIG
   */
  public async loadAll() {
    const promises = Object.entries(SOUND_CONFIG).map(([name, settings]) => {
      if (settings.enabled) {
        return this.loadSound(name as SoundEvent, settings.path);
      }
      return Promise.resolve();
    });
    await Promise.all(promises);
  }

  /**
   * Plays a pre-loaded sound by name
   */
  public play(name: SoundEvent) {
    if (this.isMuted || !this.context || !this.buffers.has(name)) return;

    const settings = SOUND_CONFIG[name];
    if (!settings || !settings.enabled) return;

    const now = Date.now();
    const throttleTime = settings.cooldown || 50;
    const lastPlay = this.lastPlayTimes.get(name) || 0;

    // Prevent sounds from overlapping too closely and causing a loud "storm"
    if (now - lastPlay < throttleTime) {
      return;
    }

    this.lastPlayTimes.set(name, now);

    const playAudio = () => {
      try {
        if (this.context!.state === 'suspended') {
          this.context!.resume();
        }

        const source = this.context!.createBufferSource();
        source.buffer = this.buffers.get(name)!;

        const gainNode = this.context!.createGain();
        gainNode.gain.value = settings.volume;

        source.connect(gainNode);
        gainNode.connect(this.context!.destination);

        source.start(0);
      } catch (e) {
        console.error(`SoundManager: Error playing sound ${name}`, e);
      }
    };

    if (settings.delayMs > 0) {
      setTimeout(playAudio, settings.delayMs);
    } else {
      playAudio();
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
