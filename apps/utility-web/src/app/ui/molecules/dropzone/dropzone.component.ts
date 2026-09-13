import { Component, input, output, signal, viewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { BadgeComponent } from '@app/ui/atoms/badge/badge.component';

const isFileDrag = (event: DragEvent): boolean => !!event.dataTransfer?.types.includes('Files');

@Component({
  selector: 'app-dropzone',
  standalone: true,
  imports: [CommonModule, BadgeComponent],
  templateUrl: './dropzone.component.html',
  host: {
    class: 'border-2 border-dashed border-ink-faint rounded-lg px-6 py-10 text-center cursor-pointer transition-[background,border-color] duration-shift ease-run min-w-0 hover:border-ink-muted active:shadow-stamped',
    '(window:dragenter)': 'onWindowDragEnter($event)',
    '(window:dragleave)': 'onWindowDragLeave($event)',
    '(window:drop)': 'onWindowDrop($event)',
    '(dragover)': 'onDragOver($event)',
    '(dragleave)': 'onDragLeave($event)',
    '(drop)': 'onDrop($event)',
    '(click)': 'openFilePicker()',
    '[class.border-riso-pink]': 'isDragging()',
    '[class.dropzone-inviting]': 'isFileOverDocument() && !isDragging()',
    '[class.bg-paper-fresh]': '!isDragging()',
    '[style.background]': "isDragging() ? 'radial-gradient(120% 90% at 50% 50%, #FCF8ED 55%, rgba(255,62,165,0.35) 100%)' : null",
  },
})
export class DropzoneComponent {
  private readonly fileInputRef = viewChild.required<ElementRef<HTMLInputElement>>('fileInput');

  accept = input<string>('image/png,image/jpeg,image/webp,image/avif,image/gif');
  supportedFormats = input<readonly string[]>(['PNG', 'JPEG', 'WebP', 'AVIF']);
  title = input<string>('Drop input file here, or browse');
  /** When true, accepts and emits every selected/dropped file via `filesSelected` instead of just the first. */
  multiple = input<boolean>(false);
  showPasteHint = input<boolean>(true);
  fileSelected = output<File>();
  filesSelected = output<File[]>();

  /** Cursor is over this exact plate. */
  isDragging = signal(false);
  /** A file is being dragged somewhere over the page, not yet over this plate — the earlier, quieter invitation. */
  isFileOverDocument = signal(false);

  private dragEnterDepth = 0;

  /** window:dragenter/dragleave bubble with every child crossed, so depth-count rather than toggle on a single event, and ignore any drag that isn't carrying files (e.g. dragging selected text). */
  onWindowDragEnter(event: DragEvent): void {
    if (!isFileDrag(event)) {
      return;
    }
    this.dragEnterDepth++;
    this.isFileOverDocument.set(true);
  }

  onWindowDragLeave(event: DragEvent): void {
    if (!isFileDrag(event)) {
      return;
    }
    this.dragEnterDepth = Math.max(0, this.dragEnterDepth - 1);
    if (this.dragEnterDepth === 0) {
      this.isFileOverDocument.set(false);
    }
  }

  /**
   * A drop anywhere on the page lands here too, since the event bubbles from wherever it landed
   * up to `window`. `onDrop` below stops propagation for a drop directly on this plate, so this
   * only runs for drops elsewhere on the page — without it, the browser's default action for an
   * unhandled file drop is to navigate the tab to the file, discarding the page. Widening capture
   * to the whole page (not just the dashed rect) is deliberate: the plate is still the visible
   * target, but a near-miss drop should still land the file rather than punishing imprecision.
   */
  onWindowDrop(event: DragEvent): void {
    event.preventDefault();
    this.dragEnterDepth = 0;
    this.isFileOverDocument.set(false);
    this.emitFiles(event.dataTransfer?.files ?? null);
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    this.isDragging.set(true);
  }

  onDragLeave(event: DragEvent): void {
    event.preventDefault();
    this.isDragging.set(false);
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragging.set(false);
    this.isFileOverDocument.set(false);
    this.dragEnterDepth = 0;
    this.emitFiles(event.dataTransfer?.files ?? null);
  }

  onFileInputChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.emitFiles(input.files);
  }

  openFilePicker(): void {
    this.fileInputRef().nativeElement.click();
  }

  private emitFiles(files: FileList | null): void {
    if (!files?.length) {
      return;
    }

    if (this.multiple()) {
      this.filesSelected.emit(Array.from(files));
    } else {
      this.fileSelected.emit(files[0]);
    }
  }
}
