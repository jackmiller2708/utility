import { Component, input, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { BadgeComponent } from '../../atoms/badge/badge.component.js';

@Component({
  selector: 'app-dropzone',
  standalone: true,
  imports: [CommonModule, BadgeComponent],
  templateUrl: './dropzone.component.html',
})
export class DropzoneComponent {
  accept = input<string>('image/png,image/jpeg,image/webp,image/avif,image/gif');
  supportedFormats = input<readonly string[]>(['PNG', 'JPEG', 'WebP', 'AVIF']);
  title = input<string>('Drop input file here, or browse');
  /** When true, accepts and emits every selected/dropped file via `filesSelected` instead of just the first. */
  multiple = input<boolean>(false);
  showPasteHint = input<boolean>(true);
  fileSelected = output<File>();
  filesSelected = output<File[]>();

  isDragging = signal(false);

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
    this.isDragging.set(false);
    this.emitFiles(event.dataTransfer?.files ?? null);
  }

  onFileInputChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.emitFiles(input.files);
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
