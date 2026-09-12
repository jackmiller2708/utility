import { Component, input, output, viewChild, ElementRef, effect, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MotionService } from '../../../core/index.js';

/**
 * A real <video> element paired with a draggable playhead — the one genuinely new material this
 * app handles (time-based media), so it gets its own component rather than a generic form field.
 * The playhead and the video's own currentTime stay in sync both ways: dragging seeks the video,
 * and playing the video (via its native controls) drags the playhead — there is one timeline, not
 * two competing ones. `timeChange` fires on every step of either, so a parent using this to pick a
 * thumbnail timestamp always reads the position the video is actually sitting at.
 */
@Component({
  selector: 'app-video-scrubber',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './video-scrubber.component.html',
  host: { class: 'flex flex-col gap-3 min-w-0' },
})
export class VideoScrubberComponent {
  private readonly motion = inject(MotionService);

  src = input<string | null>(null);
  durationSeconds = input<number>(0);
  /** A seek target set by the parent (e.g. a default 10%-into-the-clip timestamp) — applied once per change, not fought over on every render. */
  seekTo = input<number | null>(null);
  disabled = input<boolean>(false);

  /** The current playhead position, in seconds — updates on every drag step, every native seek, and every playback tick. */
  timeChange = output<number>();

  readonly currentSeconds = signal<number>(0);

  private readonly videoRef = viewChild<ElementRef<HTMLVideoElement>>('video');
  private readonly ledgerRef = viewChild<ElementRef<HTMLElement>>('ledger');
  private lastAppliedSeek: number | null = null;

  constructor() {
    effect(() => {
      const seek = this.seekTo();
      const video = this.videoRef()?.nativeElement;
      if (seek == null || !video || seek === this.lastAppliedSeek) {
        return;
      }
      this.lastAppliedSeek = seek;
      video.currentTime = seek;
      this.currentSeconds.set(seek);
    });
  }

  onVideoLoaded(): void {
    const seek = this.seekTo();
    const video = this.videoRef()?.nativeElement;
    if (video && seek != null) {
      video.currentTime = seek;
      this.lastAppliedSeek = seek;
      this.currentSeconds.set(seek);
    }
  }

  onTimeUpdate(): void {
    const video = this.videoRef()?.nativeElement;
    if (!video) {
      return;
    }
    this.currentSeconds.set(video.currentTime);
    this.timeChange.emit(video.currentTime);
  }

  onScrub(event: Event): void {
    const value = Number((event.target as HTMLInputElement).value);
    const video = this.videoRef()?.nativeElement;
    if (video) {
      video.pause();
      video.currentTime = value;
    }
    this.currentSeconds.set(value);
    this.lastAppliedSeek = value;
    this.timeChange.emit(value);
  }

  /** The Punch — one settled tick when a drag ends, not on every intermediate pixel of it. */
  onScrubCommit(): void {
    const el = this.ledgerRef()?.nativeElement;
    if (el) {
      this.motion.tick(el);
    }
  }

  formatTime(totalSeconds: number): string {
    const seconds = Math.max(0, totalSeconds);
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${String(s).padStart(2, '0')}`;
  }
}
