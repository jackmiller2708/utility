import { Component, input, output, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IconComponent } from '../../atoms/icon/icon.component.js';
import { JobTicketComponent } from '../job-ticket/job-ticket.component.js';
import { RuntimeStatusService } from '../../../core/index.js';
import type { JobModel } from '../../../domain/index.js';

/**
 * One batch (N jobs submitted together against one shared settings form, e.g. 10 images
 * resized the same way) collapses into a single tray ticket instead of N separate ones —
 * expanding reveals the real per-file `JobTicketComponent`s underneath, each still individually
 * cancellable. Dismiss is batch-scoped only (clears every job in it at once): the backend has no
 * batch concept, so this component's grouping is purely a tray presentation over jobs that already
 * share a client-assigned `batchId`, and per-file dismiss would leave an orphaned, un-groupable job.
 */
@Component({
  selector: 'app-batch-ticket',
  standalone: true,
  imports: [CommonModule, IconComponent, JobTicketComponent],
  templateUrl: './batch-ticket.component.html',
  host: {
    class: 'block relative border rounded-lg bg-paper-fresh border-paper-deckle overflow-hidden',
    '[class.p-2]': 'true',
  },
})
export class BatchTicketComponent {
  private readonly runtimeStatus = inject(RuntimeStatusService);

  jobs = input.required<readonly JobModel[]>();
  index = input<number>(0);

  cancelled = output<void>();
  dismissed = output<void>();
  jobCancelled = output<string>();

  readonly expanded = signal(false);

  readonly total = computed(() => this.jobs().length);
  readonly completedCount = computed(() => this.jobs().filter((job) => job.status === 'completed').length);
  readonly activeCount = computed(() => this.jobs().filter((job) => job.isActive).length);
  readonly failedCount = computed(() => this.jobs().filter((job) => job.status === 'failed').length);
  readonly isActive = computed(() => this.activeCount() > 0);
  readonly isTerminal = computed(() => this.activeCount() === 0);

  /**
   * A registered operation's real name (e.g. "Resize Image", or a saved recipe's own name) when
   * it's still known to the tool registry; otherwise the id humanized as a fallback. The plain
   * regex fallback alone reads fine for a stable id like "image.resize" but garbles a recipe's
   * `recipe.<generated-id>` — the registry lookup is what makes a recipe's batch ticket show its
   * actual name instead.
   */
  readonly operationLabel = computed(() => {
    const id = this.jobs()[0]?.operationId ?? '';
    const registered = this.runtimeStatus.tools()
      .flatMap((tool) => tool.operations)
      .find((op) => op.id === id)?.name;
    return registered ?? id.replace(/[.-]/g, ' ');
  });

  toggle(): void {
    this.expanded.update((value) => !value);
  }
}
