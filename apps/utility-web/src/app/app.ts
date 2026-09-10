import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HeaderComponent } from './components/header.component.js';
import { ToolSidebarComponent } from './components/tool-sidebar.component.js';
import { ImageResizeComponent } from './components/image-resize.component.js';
import { ApiService } from './services/api.service.js';
import type { AuthStatusResponse, ToolInfo } from '@utility/protocol';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, HeaderComponent, ToolSidebarComponent, ImageResizeComponent],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App implements OnInit {
  private readonly apiService = inject(ApiService);

  readonly authStatus = signal<AuthStatusResponse | null>(null);
  readonly tools = signal<readonly ToolInfo[]>([]);
  readonly activeOperationId = signal<string>('image.resize');

  ngOnInit() {
    this.apiService.getAuthStatus().subscribe({
      next: (status) => this.authStatus.set(status),
      error: () => this.authStatus.set(null),
    });

    this.apiService.getTools().subscribe({
      next: (res) => this.tools.set(res.tools),
      error: () => {
        // Default fallback info if offline
        this.tools.set([
          {
            id: 'image',
            name: 'Image Processing',
            description: 'High performance image resizing, conversion, and optimization.',
            category: 'Media',
            operations: [
              {
                id: 'image.resize',
                name: 'Resize Image',
                description: 'Resize an image to target dimensions while maintaining or modifying aspect ratio.',
                parameters: [],
              },
            ],
          },
        ]);
      },
    });
  }

  setOperation(opId: string) {
    this.activeOperationId.set(opId);
  }
}
