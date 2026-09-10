import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import type {
  ToolsListResponse,
  ImageResizeOutput,
  ArtifactResponse,
  AuthStatusResponse,
} from '@utility/protocol';

@Injectable({
  providedIn: 'root',
})
export class ApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = 'http://127.0.0.1:3000/api/v1';

  getAuthStatus(): Observable<AuthStatusResponse> {
    return this.http.get<AuthStatusResponse>(`${this.baseUrl}/auth/status`);
  }

  getTools(): Observable<ToolsListResponse> {
    return this.http.get<ToolsListResponse>(`${this.baseUrl}/tools`);
  }

  resizeImage(
    file: File,
    options: {
      width?: number | null;
      height?: number | null;
      fit?: string;
      position?: string;
      withoutEnlargement?: boolean;
      format?: string;
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

    return this.http.post<ImageResizeOutput>(
      `${this.baseUrl}/tools/image.resize`,
      formData
    );
  }

  getArtifact(id: string): Observable<ArtifactResponse> {
    return this.http.get<ArtifactResponse>(`${this.baseUrl}/artifacts/${id}`);
  }

  getArtifactFileUrl(id: string): string {
    return `${this.baseUrl}/artifacts/${id}/file`;
  }

  getArtifactDownloadUrl(id: string): string {
    return `${this.baseUrl}/artifacts/${id}/download`;
  }
}
