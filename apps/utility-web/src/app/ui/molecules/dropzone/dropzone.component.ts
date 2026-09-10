import { Component, input, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IconComponent } from '../../atoms/icon/icon.component.js';
import { BadgeComponent } from '../../atoms/badge/badge.component.js';

@Component({
  selector: 'app-dropzone',
  standalone: true,
  imports: [CommonModule, IconComponent, BadgeComponent],
  templateUrl: './dropzone.component.html',
})
export class DropzoneComponent {
  accept = input<string>('image/png,image/jpeg,image/webp,image/avif,image/gif');
  supportedFormats = input<readonly string[]>(['PNG', 'JPEG', 'WebP', 'AVIF']);
  title = input<string>('Drop input file here, or browse');
  fileSelected = output<File>();

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
    if (event.dataTransfer?.files?.length) {
      this.fileSelected.emit(event.dataTransfer.files[0]);
    }
  }

  onFileInputChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files?.length) {
      this.fileSelected.emit(input.files[0]);
    }
  }
}
