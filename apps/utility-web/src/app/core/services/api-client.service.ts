import type { ToolsListResponse, ImageResizeOutput, ArtifactResponse, AuthStatusResponse, PdfInspectOutput, PdfRenderPagesOutput, PdfExtractImagesOutput, JobResponse, JobListResponse, JobSubmittedResponse, JobCancelResponse } from '@utility/protocol';

import { Injectable, inject } from '@angular/core';
import { HttpClientService } from './http-client.service.js';
import { API_CONFIG } from '../tokens/api-config.token.js';

interface ImageResizeOptions {
  width?: number | null;
  height?: number | null;
  fit?: string;
  position?: string;
  withoutEnlargement?: boolean;
  format?: string;
  quality?: number | null;
}

interface PdfRenderPagesOptions {
  dpi?: number;
  firstPage?: number | null;
  lastPage?: number | null;
}

@Injectable({ providedIn: 'root' })
export class ApiClientService {
  private readonly http = inject(HttpClientService);
  private readonly config = inject(API_CONFIG);

  getAuthStatus$() {
    return this.http.get<AuthStatusResponse>(`${this.config.baseUrl}/auth/status`);
  }

  getTools$() {
    return this.http.get<ToolsListResponse>(`${this.config.baseUrl}/tools`);
  }

  executeImageResize$(file: File, options: ImageResizeOptions) {
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

    return this.http.post<ImageResizeOutput>(`${this.config.baseUrl}/tools/image.resize`, formData);
  }

  inspectPdf$(file: File) {
    const formData = new FormData();
    formData.append('file', file, file.name);

    return this.http.post<PdfInspectOutput>(`${this.config.baseUrl}/tools/pdf.inspect`, formData);
  }

  renderPdfPages$(file: File, options: { dpi?: number; firstPage?: number | null; lastPage?: number | null }) {
    const formData = new FormData();
    formData.append('file', file, file.name);

    if (options.dpi != null) {
      formData.append('dpi', String(options.dpi));
    }

    if (options.firstPage != null && options.firstPage > 0) {
      formData.append('firstPage', String(options.firstPage));
    }

    if (options.lastPage != null && options.lastPage > 0) {
      formData.append('lastPage', String(options.lastPage));
    }

    return this.http.post<PdfRenderPagesOutput>(`${this.config.baseUrl}/tools/pdf.render-pages`, formData);
  }

  extractPdfImages$(file: File) {
    const formData = new FormData();
    formData.append('file', file, file.name);

    return this.http.post<PdfExtractImagesOutput>(`${this.config.baseUrl}/tools/pdf.extract-images`, formData);
  }

  submitSplitJob$(file: File, ranges: readonly { firstPage: number; lastPage: number }[]) {
    const formData = new FormData();
    formData.append('file', file, file.name);
    formData.append('ranges', JSON.stringify(ranges));

    return this.http.post<JobSubmittedResponse>(`${this.config.baseUrl}/jobs/pdf.split`, formData);
  }

  submitMergeJob$(files: readonly File[]) {
    const formData = new FormData();

    for (const file of files) {
      formData.append('files', file, file.name);
    }

    return this.http.post<JobSubmittedResponse>(`${this.config.baseUrl}/jobs/pdf.merge`, formData);
  }

  submitRenderPagesJob$(file: File, options: PdfRenderPagesOptions) {
    const formData = new FormData();
    formData.append('file', file, file.name);

    if (options.dpi != null) {
      formData.append('dpi', String(options.dpi));
    }

    if (options.firstPage != null && options.firstPage > 0) {
      formData.append('firstPage', String(options.firstPage));
    }

    if (options.lastPage != null && options.lastPage > 0) {
      formData.append('lastPage', String(options.lastPage));
    }

    return this.http.post<JobSubmittedResponse>(`${this.config.baseUrl}/jobs/pdf.render-pages`, formData);
  }

  submitExtractImagesJob$(file: File) {
    const formData = new FormData();
    formData.append('file', file, file.name);

    return this.http.post<JobSubmittedResponse>(`${this.config.baseUrl}/jobs/pdf.extract-images`, formData);
  }

  listJobs$() {
    return this.http.get<JobListResponse>(`${this.config.baseUrl}/jobs`);
  }

  getJob$(id: string) {
    return this.http.get<JobResponse>(`${this.config.baseUrl}/jobs/${id}`);
  }

  cancelJob$(id: string) {
    return this.http.delete<JobCancelResponse>(`${this.config.baseUrl}/jobs/${id}`);
  }

  getArtifact$(id: string) {
    return this.http.get<ArtifactResponse>(`${this.config.baseUrl}/artifacts/${id}`);
  }

  getArtifactFileUrl(id: string): string {
    return `${this.config.baseUrl}/artifacts/${id}/file`;
  }

  getArtifactDownloadUrl(id: string): string {
    return `${this.config.baseUrl}/artifacts/${id}/download`;
  }
}
