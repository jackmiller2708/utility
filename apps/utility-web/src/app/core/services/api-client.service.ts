import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { API_CONFIG } from '../tokens/api-config.token.js';
import type {
  ToolsListResponse,
  ImageResizeOutput,
  ArtifactResponse,
  AuthStatusResponse,
} from '@utility/protocol';

@Injectable({
  providedIn: 'root',
})
export class ApiClientService {
  private readonly http = inject(HttpClient);
  private readonly config = inject(API_CONFIG);

  getAuthStatus(): Observable<AuthStatusResponse> {
    return this.http.get<AuthStatusResponse>(`${this.config.baseUrl}/auth/status`);
  }

  getTools(): Observable<ToolsListResponse> {
    return this.http.get<ToolsListResponse>(`${this.config.baseUrl}/tools`);
  }

  executeImageResize(
    file: File,
    options: {
      width?: number | null;
      height?: number | null;
      fit?: string;
      position?: string;
      withoutEnlargement?: boolean;
      format?: string;
      quality?: number | null;
    }
  ): Observable<ImageResizeOutput> {
    const formData = new FormData();
    formData.append('file', file, file.name);

    if (options.width != null && options.width > 0) {
      formData.append('width', String(options.width));
    }
    if (options.height != null && options.height > 0) {
      formData.append('height', String(options.height));
    }
    if (options.fit) {
      formData.append('fit', options.fit);
    }
    if (options.position) {
      formData.append('position', options.position);
    }
    if (options.withoutEnlargement !== undefined) {
      formData.append('withoutEnlargement', String(options.withoutEnlargement));
    }
    if (options.format) {
      formData.append('format', options.format);
    }
    if (options.quality != null && options.quality > 0) {
      formData.append('quality', String(options.quality));
    }

    return this.http.post<ImageResizeOutput>(
      `${this.config.baseUrl}/tools/image.resize`,
      formData
    );
  }

  getArtifact(id: string): Observable<ArtifactResponse> {
    return this.http.get<ArtifactResponse>(`${this.config.baseUrl}/artifacts/${id}`);
  }

  getArtifactFileUrl(id: string): string {
    return `${this.config.baseUrl}/artifacts/${id}/file`;
  }

  getArtifactDownloadUrl(id: string): string {
    return `${this.config.baseUrl}/artifacts/${id}/download`;
  }
}
