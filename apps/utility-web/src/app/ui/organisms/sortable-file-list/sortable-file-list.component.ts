import { Component, input, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IconComponent } from '../../atoms/icon/icon.component.js';
import { ButtonComponent } from '../../atoms/button/button.component.js';

export interface SortableFileItem {
  readonly id: string;
  readonly name: string;
  readonly sizeFormatted: string;
  readonly detail?: string;
}

@Component({
  selector: 'app-sortable-file-list',
  standalone: true,
  imports: [CommonModule, IconComponent, ButtonComponent],
  templateUrl: './sortable-file-list.component.html',
})
export class SortableFileListComponent {
  items = input<readonly SortableFileItem[]>([]);
  reorder = output<{ fromIndex: number; toIndex: number }>();
  remove = output<string>();

  readonly dragIndex = signal<number | null>(null);
  readonly dragOverIndex = signal<number | null>(null);

  onDragStart(index: number, event: DragEvent): void {
    this.dragIndex.set(index);
    event.dataTransfer?.setData('text/plain', String(index));
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
    }
  }

  onDragOver(index: number, event: DragEvent): void {
    event.preventDefault();
    this.dragOverIndex.set(index);
  }

  onDragLeave(): void {
    this.dragOverIndex.set(null);
  }

  onDrop(targetIndex: number, event: DragEvent): void {
    event.preventDefault();
    const fromIndex = this.dragIndex();
    this.dragIndex.set(null);
    this.dragOverIndex.set(null);

    if (fromIndex === null || fromIndex === targetIndex) {
      return;
    }

    this.reorder.emit({ fromIndex, toIndex: targetIndex });
  }

  onDragEnd(): void {
    this.dragIndex.set(null);
    this.dragOverIndex.set(null);
  }
}
