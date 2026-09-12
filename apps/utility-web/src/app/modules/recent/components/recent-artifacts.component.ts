import { Component, inject, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IconComponent, BadgeComponent, InputComponent, ButtonComponent, TileGroupComponent, TileItem } from '@app/ui';
import { RecentArtifactsService } from '../services/recent-artifacts.service.js';

const IMAGE_MIME_PREFIX = 'image/';
const ALL_OPERATIONS_TILE_ID = 'all';

@Component({
  selector: 'app-recent-artifacts-page',
  standalone: true,
  imports: [CommonModule, IconComponent, BadgeComponent, InputComponent, ButtonComponent, TileGroupComponent],
  providers: [RecentArtifactsService],
  templateUrl: './recent-artifacts.component.html',
  host: { class: 'flex flex-col gap-6 min-w-0 w-full' },
})
export class RecentArtifactsComponent implements OnInit {
  readonly service = inject(RecentArtifactsService);

  readonly operationTiles = computed<readonly TileItem[]>(() => [
    { id: ALL_OPERATIONS_TILE_ID, label: 'ALL' },
    ...this.service.operationOptions().map((op) => ({ id: op.id, label: op.label.toUpperCase() })),
  ]);

  readonly activeOperationTile = computed(() => this.service.selectedOperation() ?? ALL_OPERATIONS_TILE_ID);

  ngOnInit(): void {
    this.service.load();
  }

  isImage(mimeType: string): boolean {
    return mimeType.startsWith(IMAGE_MIME_PREFIX);
  }

  operationLabel(operation: string | null): string {
    if (!operation) {
      return '';
    }
    return operation.replace(/[.-]/g, ' ');
  }

  onSearchInput(query: string): void {
    this.service.setSearch(query);
  }

  onOperationTileSelected(tileId: string): void {
    this.service.setOperationFilter(tileId === ALL_OPERATIONS_TILE_ID ? null : tileId);
  }
}
