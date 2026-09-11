import { Component, input, output, signal, effect, inject, ElementRef, viewChildren } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IconComponent } from '../../atoms/icon/icon.component.js';
import { ButtonComponent } from '../../atoms/button/button.component.js';
import { MotionService } from '../../../core/index.js';

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
  private readonly motion = inject(MotionService);

  items = input<readonly SortableFileItem[]>([]);
  reorder = output<{ fromIndex: number; toIndex: number }>();
  remove = output<string>();

  readonly dragIndex = signal<number | null>(null);
  readonly dragOverIndex = signal<number | null>(null);

  private readonly rows = viewChildren<ElementRef<HTMLElement>>('row');
  private readonly lastRects = new Map<string, DOMRect>();

  constructor() {
    /** FLIP: whatever moved this row here — a drag-reorder, a sibling's removal — inverts into a spring slide instead of a jump. Tracked continuously rather than only around drag, so removal-caused reflow gets it too. */
    effect(() => {
      const currentItems = this.items();
      const rowEls = this.rows();
      const seenIds = new Set<string>();

      currentItems.forEach((item, i) => {
        seenIds.add(item.id);
        const el = rowEls[i]?.nativeElement;
        if (!el) {
          return;
        }

        const newRect = el.getBoundingClientRect();
        const oldRect = this.lastRects.get(item.id);

        if (oldRect) {
          this.motion.flipMove(el, oldRect.top - newRect.top);
        }

        this.lastRects.set(item.id, newRect);
      });

      for (const id of this.lastRects.keys()) {
        if (!seenIds.has(id)) {
          this.lastRects.delete(id);
        }
      }
    });
  }

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
