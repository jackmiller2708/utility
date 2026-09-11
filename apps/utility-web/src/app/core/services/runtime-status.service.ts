import type { AuthStatusResponse } from '@utility/protocol';
import type { ToolModel } from '../../domain/index.js';

import { Injectable, inject, signal } from '@angular/core';
import { ApiClientService } from './api-client.service.js';
import { ToolModelsFromToolsListResponse } from '../../domain/index.js';
import { Either } from 'effect';

@Injectable({
  providedIn: 'root',
})
export class RuntimeStatusService {
  private readonly apiClient = inject(ApiClientService);

  readonly authStatus = signal<AuthStatusResponse | null>(null);
  readonly tools = signal<readonly ToolModel[]>([]);
  readonly isConnected = signal(false);

  refreshStatus(): void {
    this.apiClient.getAuthStatus$().subscribe(Either.match({
      onRight: (status) => {
        this.authStatus.set(status);
        this.isConnected.set(true);
      },
      onLeft: () => {
        this.authStatus.set(null);
        this.isConnected.set(false);
      },
    }));

    this.apiClient.getTools$().subscribe(Either.match({
      onRight: (res) => this.tools.set(ToolModelsFromToolsListResponse.from(res)),
      onLeft: () => {
        // Fallback registered tools description for local UI preview
        this.tools.set([{
          id: 'image',
          name: 'Image Processing',
          description: 'High performance image resizing, conversion, and optimization.',
          category: 'Media',
          operations: [{
            id: 'image.resize',
            name: 'Resize Image',
            description: 'Resize an image to target dimensions while maintaining or modifying aspect ratio.',
            parameters: [],
          }],
        }]);
      },
    }));
  }
}
