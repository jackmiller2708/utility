import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ButtonComponent, BadgeComponent, IconComponent } from '@app/ui';
import { RecipesService } from '../services/recipes.service';
import { RuntimeStatusService } from '@app/core';
import type { WorkflowModel } from '@app/domain';
import { Either } from 'effect';

@Component({
  selector: 'app-recipes-list-page',
  standalone: true,
  imports: [CommonModule, RouterLink, ButtonComponent, BadgeComponent, IconComponent],
  templateUrl: './recipes-list.component.html',
  host: { class: 'flex flex-col gap-6 min-w-0 w-full' },
})
export class RecipesListComponent implements OnInit {
  readonly service = inject(RecipesService);
  private readonly runtimeStatus = inject(RuntimeStatusService);

  readonly deletingId = signal<string | null>(null);
  readonly isDeleting = signal<string | null>(null);

  ngOnInit(): void {
    this.service.ensureLoaded();
  }

  /** Falls back to a formatted operation id (e.g. "media thumbnail") if the operation is no longer registered — matches Recent's own `operationLabel` treatment. */
  stepLabel(operationId: string): string {
    const label = this.runtimeStatus.tools()
      .flatMap((tool) => tool.operations)
      .find((op) => op.id === operationId)?.name;
    return label ?? operationId.replace(/[.-]/g, ' ');
  }

  requestDelete(id: string): void {
    this.deletingId.set(id);
  }

  cancelDelete(): void {
    this.deletingId.set(null);
  }

  confirmDelete(workflow: WorkflowModel): void {
    this.isDeleting.set(workflow.id);
    this.service.delete$(workflow.id).subscribe(Either.match({
      onRight: () => {
        this.service.onDeleted(workflow.id);
        this.deletingId.set(null);
        this.isDeleting.set(null);
      },
      onLeft: () => {
        this.isDeleting.set(null);
      },
    }));
  }
}
