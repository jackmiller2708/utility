import { Component, OnInit, inject, signal } from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';
import { WorkbenchLayoutComponent } from './ui/index.js';
import { RuntimeStatusService } from './core/index.js';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, WorkbenchLayoutComponent],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App implements OnInit {
  private readonly router = inject(Router);
  readonly runtimeStatus = inject(RuntimeStatusService);

  readonly activeOperationId = signal<string>('image.resize');

  ngOnInit(): void {
    this.runtimeStatus.refreshStatus();
  }

  setOperation(opId: string): void {
    this.activeOperationId.set(opId);

    if (opId === 'image.resize') {
      this.router.navigate(['/media/image-resize']);
    }
  }
}
