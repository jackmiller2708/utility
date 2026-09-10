import {
  Component,
  signal,
  inject,
  computed,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../services/api.service.js';
import type { ArtifactResponse } from '@utility/protocol';

interface LocalImageDetails {
  file: File;
  previewUrl: string;
  name: string;
  size: number;
  width: number;
  height: number;
}

@Component({
  selector: 'app-image-resize',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="space-y-6">
      <!-- Section header -->
      <div class="flex items-center justify-between pb-4 border-b border-zinc-800">
        <div>
          <h2 class="text-xl font-bold text-zinc-100 flex items-center gap-2">
            <span class="p-1.5 rounded-md bg-indigo-950 text-indigo-400 border border-indigo-800/50">
              <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect width="18" height="18" x="3" y="3" rx="2" ry="2"/>
                <circle cx="9" cy="9" r="2"/>
                <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>
              </svg>
            </span>
            Image Resize
          </h2>
          <p class="text-sm text-zinc-400 mt-1">
            Fast, server-side image scaling and optimization powered by Sharp and Effect runtime.
          </p>
        </div>
      </div>

      <!-- Main 2-column layout -->
      <div class="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <!-- Left: Upload and Controls (7 cols) -->
        <div class="lg:col-span-7 space-y-6">
          <!-- File Dropzone -->
          @if (!selectedImage()) {
            <div
              (dragover)="onDragOver($event)"
              (dragleave)="onDragLeave($event)"
              (drop)="onDrop($event)"
              (click)="fileInput.click()"
              [class.border-indigo-500]="isDragging()"
              [class.bg-indigo-950/20]="isDragging()"
              class="border-2 border-dashed border-zinc-700 hover:border-indigo-500/80 rounded-xl p-8 text-center cursor-pointer transition-colors bg-zinc-900/40 hover:bg-zinc-900/70"
            >
              <input
                #fileInput
                type="file"
                accept="image/png,image/jpeg,image/webp,image/avif,image/gif"
                class="hidden"
                (change)="onFileSelected($event)"
              />
              <div class="w-12 h-12 mx-auto rounded-full bg-zinc-800 flex items-center justify-center text-indigo-400 mb-3">
                <svg xmlns="http://www.w3.org/2000/svg" class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              <p class="text-base font-medium text-zinc-200">
                Click or drag & drop image here
              </p>
              <p class="text-xs text-zinc-400 mt-1">
                Supports PNG, JPEG, WebP, AVIF
              </p>
            </div>
          } @else {
            <!-- Selected Image Card -->
            <div class="bg-zinc-900/60 border border-zinc-800 rounded-xl p-4 flex items-center justify-between">
              <div class="flex items-center space-x-4">
                <div class="w-16 h-16 rounded-lg overflow-hidden bg-zinc-950 border border-zinc-800 flex-shrink-0 flex items-center justify-center">
                  <img [src]="selectedImage()?.previewUrl" alt="Preview" class="w-full h-full object-cover" />
                </div>
                <div>
                  <div class="font-medium text-zinc-200 text-sm truncate max-w-xs sm:max-w-md">
                    {{ selectedImage()?.name }}
                  </div>
                  <div class="text-xs text-zinc-400 flex items-center gap-3 mt-1">
                    <span>{{ selectedImage()?.width }} × {{ selectedImage()?.height }} px</span>
                    <span>•</span>
                    <span>{{ formatBytes(selectedImage()?.size || 0) }}</span>
                  </div>
                </div>
              </div>
              <button
                type="button"
                (click)="resetFile()"
                class="px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded-lg transition-colors"
              >
                Change
              </button>
            </div>
          }

          <!-- Form Controls -->
          <div class="bg-zinc-900/40 border border-zinc-800/80 rounded-xl p-6 space-y-6">
            <h3 class="text-sm font-semibold text-zinc-300 uppercase tracking-wider">
              Resize Settings
            </h3>

            <!-- Dimensions -->
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label class="block text-xs font-medium text-zinc-400 mb-1.5">Target Width (px)</label>
                <input
                  type="number"
                  [(ngModel)]="targetWidth"
                  placeholder="Auto"
                  class="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-lg text-sm text-zinc-100 placeholder-zinc-600 outline-none transition-all"
                />
              </div>
              <div>
                <label class="block text-xs font-medium text-zinc-400 mb-1.5">Target Height (px)</label>
                <input
                  type="number"
                  [(ngModel)]="targetHeight"
                  placeholder="Auto"
                  class="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-lg text-sm text-zinc-100 placeholder-zinc-600 outline-none transition-all"
                />
              </div>
            </div>

            <!-- Quick aspect presets -->
            @if (selectedImage()) {
              <div class="flex flex-wrap gap-2 pt-1">
                <span class="text-xs text-zinc-500 self-center mr-1">Presets:</span>
                <button
                  type="button"
                  (click)="applyScalePreset(0.5)"
                  class="px-2.5 py-1 text-xs bg-zinc-800/60 hover:bg-zinc-800 text-zinc-300 rounded border border-zinc-700/50"
                >
                  50%
                </button>
                <button
                  type="button"
                  (click)="applyScalePreset(0.25)"
                  class="px-2.5 py-1 text-xs bg-zinc-800/60 hover:bg-zinc-800 text-zinc-300 rounded border border-zinc-700/50"
                >
                  25%
                </button>
                <button
                  type="button"
                  (click)="applyDimensionPreset(1920, 1080)"
                  class="px-2.5 py-1 text-xs bg-zinc-800/60 hover:bg-zinc-800 text-zinc-300 rounded border border-zinc-700/50"
                >
                  1080p
                </button>
                <button
                  type="button"
                  (click)="applyDimensionPreset(800, 800)"
                  class="px-2.5 py-1 text-xs bg-zinc-800/60 hover:bg-zinc-800 text-zinc-300 rounded border border-zinc-700/50"
                >
                  Square (800)
                </button>
              </div>
            }

            <!-- Fit & Format -->
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label class="block text-xs font-medium text-zinc-400 mb-1.5">Fit Mode</label>
                <select
                  [(ngModel)]="fitMode"
                  class="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-lg text-sm text-zinc-100 outline-none transition-all"
                >
                  <option value="inside">Inside (Preserve Aspect)</option>
                  <option value="cover">Cover (Crop to Fit)</option>
                  <option value="contain">Contain (Pad)</option>
                  <option value="fill">Fill (Stretch)</option>
                  <option value="outside">Outside</option>
                </select>
              </div>

              <div>
                <label class="block text-xs font-medium text-zinc-400 mb-1.5">Output Format</label>
                <select
                  [(ngModel)]="outputFormat"
                  class="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-lg text-sm text-zinc-100 outline-none transition-all"
                >
                  <option value="">Keep Original</option>
                  <option value="webp">WebP (Optimized)</option>
                  <option value="jpeg">JPEG</option>
                  <option value="png">PNG</option>
                  <option value="avif">AVIF</option>
                </select>
              </div>
            </div>

            <!-- Toggles -->
            <div class="flex items-center space-x-3 pt-2">
              <input
                id="withoutEnlargement"
                type="checkbox"
                [(ngModel)]="withoutEnlargement"
                class="w-4 h-4 rounded border-zinc-700 bg-zinc-900 text-indigo-600 focus:ring-indigo-500"
              />
              <label for="withoutEnlargement" class="text-xs text-zinc-300 cursor-pointer">
                Do not upscale if original image is smaller
              </label>
            </div>

            <!-- Action button -->
            <div class="pt-4 border-t border-zinc-800/80">
              <button
                type="button"
                [disabled]="!selectedImage() || isProcessing()"
                (click)="processResize()"
                class="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-500 disabled:bg-zinc-800 disabled:text-zinc-500 disabled:cursor-not-allowed text-white font-medium text-sm rounded-xl shadow-lg shadow-indigo-600/20 transition-all flex items-center justify-center gap-2"
              >
                @if (isProcessing()) {
                  <svg class="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Processing with Sharp...
                } @else {
                  <span>Resize Image</span>
                }
              </button>

              @if (errorMessage()) {
                <div class="mt-3 p-3 bg-red-950/40 border border-red-800/50 rounded-lg text-xs text-red-300">
                  {{ errorMessage() }}
                </div>
              }
            </div>
          </div>
        </div>

        <!-- Right: Preview / Result Card (5 cols) -->
        <div class="lg:col-span-5 space-y-6">
          <div class="bg-zinc-900/40 border border-zinc-800 rounded-xl p-6 h-full flex flex-col justify-between">
            <div>
              <h3 class="text-sm font-semibold text-zinc-300 uppercase tracking-wider mb-4">
                Artifact & Result
              </h3>

              @if (resultArtifact(); as art) {
                <div class="space-y-4">
                  <!-- Result Image -->
                  <div class="aspect-video w-full rounded-lg overflow-hidden bg-zinc-950 border border-zinc-800 flex items-center justify-center relative group">
                    <img
                      [src]="apiService.getArtifactFileUrl(art.id)"
                      alt="Result Image"
                      class="max-w-full max-h-full object-contain"
                    />
                  </div>

                  <!-- Metrics Comparison -->
                  <div class="bg-zinc-950 border border-zinc-800 rounded-lg p-4 space-y-3">
                    <div class="flex justify-between items-center text-xs">
                      <span class="text-zinc-400">Artifact ID</span>
                      <span class="font-mono text-zinc-300">{{ art.id }}</span>
                    </div>
                    <div class="flex justify-between items-center text-xs">
                      <span class="text-zinc-400">Output Filename</span>
                      <span class="font-medium text-zinc-200">{{ art.name }}</span>
                    </div>
                    <div class="flex justify-between items-center text-xs">
                      <span class="text-zinc-400">MIME Type</span>
                      <span class="font-medium text-indigo-400">{{ art.mimeType }}</span>
                    </div>
                    <div class="flex justify-between items-center text-xs">
                      <span class="text-zinc-400">File Size</span>
                      <div class="flex items-center gap-2">
                        <span class="font-medium text-zinc-200">{{ formatBytes(art.size) }}</span>
                        @if (sizeSavingsPercentage(); as savings) {
                          <span class="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-950 text-emerald-400 border border-emerald-800/40">
                            -{{ savings }}%
                          </span>
                        }
                      </div>
                    </div>
                    @if (art.checksum) {
                      <div class="flex justify-between items-center text-xs">
                        <span class="text-zinc-400">SHA-256</span>
                        <span class="font-mono text-zinc-500 text-[10px] truncate max-w-[160px]" [title]="art.checksum">
                          {{ art.checksum }}
                        </span>
                      </div>
                    }
                  </div>
                </div>
              } @else if (selectedImage(); as img) {
                <!-- Original Image Preview placeholder -->
                <div class="space-y-4">
                  <div class="aspect-video w-full rounded-lg overflow-hidden bg-zinc-950 border border-zinc-800 flex items-center justify-center">
                    <img [src]="img.previewUrl" alt="Original" class="max-w-full max-h-full object-contain" />
                  </div>
                  <div class="p-4 bg-zinc-950/60 border border-zinc-800/60 rounded-lg text-center">
                    <p class="text-xs text-zinc-400">
                      Configure resize options on the left and click "Resize Image" to generate artifact.
                    </p>
                  </div>
                </div>
              } @else {
                <!-- Empty state -->
                <div class="h-64 flex flex-col items-center justify-center text-center p-6 border border-dashed border-zinc-800 rounded-lg">
                  <div class="w-10 h-10 rounded-full bg-zinc-800/60 flex items-center justify-center text-zinc-500 mb-2">
                    <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                    </svg>
                  </div>
                  <p class="text-xs font-medium text-zinc-400">No output yet</p>
                  <p class="text-[11px] text-zinc-500 mt-1">Processed artifacts will appear here</p>
                </div>
              }
            </div>

            <!-- Download Button -->
            @if (resultArtifact(); as art) {
              <div class="pt-6 mt-6 border-t border-zinc-800">
                <a
                  [href]="apiService.getArtifactDownloadUrl(art.id)"
                  class="w-full py-3 px-4 bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-sm rounded-xl shadow-lg shadow-emerald-600/20 transition-all flex items-center justify-center gap-2"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  Download {{ art.name }}
                </a>
              </div>
            }
          </div>
        </div>
      </div>
    </div>
  `,
})
export class ImageResizeComponent {
  readonly apiService = inject(ApiService);

  selectedImage = signal<LocalImageDetails | null>(null);
  resultArtifact = signal<ArtifactResponse | null>(null);
  isDragging = signal(false);
  isProcessing = signal(false);
  errorMessage = signal<string | null>(null);

  targetWidth: number | null = 800;
  targetHeight: number | null = null;
  fitMode = 'inside';
  outputFormat = '';
  withoutEnlargement = true;

  sizeSavingsPercentage = computed(() => {
    const orig = this.selectedImage()?.size;
    const res = this.resultArtifact()?.size;
    if (!orig || !res || res >= orig) return null;
    return Math.round(((orig - res) / orig) * 100);
  });

  onDragOver(event: DragEvent) {
    event.preventDefault();
    this.isDragging.set(true);
  }

  onDragLeave(event: DragEvent) {
    event.preventDefault();
    this.isDragging.set(false);
  }

  onDrop(event: DragEvent) {
    event.preventDefault();
    this.isDragging.set(false);
    if (event.dataTransfer?.files?.length) {
      this.handleFile(event.dataTransfer.files[0]);
    }
  }

  onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files?.length) {
      this.handleFile(input.files[0]);
    }
  }

  handleFile(file: File) {
    this.errorMessage.set(null);
    this.resultArtifact.set(null);

    const previewUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      this.selectedImage.set({
        file,
        previewUrl,
        name: file.name,
        size: file.size,
        width: img.naturalWidth,
        height: img.naturalHeight,
      });
      if (!this.targetWidth && !this.targetHeight) {
        this.targetWidth = Math.round(img.naturalWidth / 2);
      }
    };
    img.src = previewUrl;
  }

  resetFile() {
    this.selectedImage.set(null);
    this.resultArtifact.set(null);
    this.errorMessage.set(null);
  }

  applyScalePreset(scale: number) {
    const current = this.selectedImage();
    if (!current) return;
    this.targetWidth = Math.round(current.width * scale);
    this.targetHeight = Math.round(current.height * scale);
  }

  applyDimensionPreset(w: number, h: number) {
    this.targetWidth = w;
    this.targetHeight = h;
  }

  processResize() {
    const img = this.selectedImage();
    if (!img) return;

    this.isProcessing.set(true);
    this.errorMessage.set(null);

    this.apiService
      .resizeImage(img.file, {
        width: this.targetWidth,
        height: this.targetHeight,
        fit: this.fitMode,
        withoutEnlargement: this.withoutEnlargement,
        format: this.outputFormat || undefined,
      })
      .subscribe({
        next: (res) => {
          this.resultArtifact.set(res.artifact);
          this.isProcessing.set(false);
        },
        error: (err) => {
          this.errorMessage.set(
            err?.error?.message || err?.message || 'Failed to process image'
          );
          this.isProcessing.set(false);
        },
      });
  }

  formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}
