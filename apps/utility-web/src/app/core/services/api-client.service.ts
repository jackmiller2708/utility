import type { ToolsListResponse, ImageResizeOutput, ArtifactResponse, ArtifactListResponse, AuthStatusResponse, DeviceResponse, DeviceListResponse, RevokeDeviceResponse, ApproveDeviceResponse, DeleteDeviceResponse, PdfInspectOutput, PdfRenderPagesOutput, PdfExtractImagesOutput, MediaInspectOutput, VideoDownloadInfoOutput, JobResponse, JobListResponse, JobSubmittedResponse, BatchJobSubmittedResponse, JobCancelResponse, WorkflowResponse, WorkflowListResponse } from '@utility/protocol';
import type { HttpResponse } from '../interfaces';

import { Injectable, inject } from '@angular/core';
import { HttpClientService } from './http-client.service';
import { LruRequestCache } from './lru-request-cache';
import { API_CONFIG } from '../tokens/api-config.token';
import { Either } from 'effect';
import { tap } from 'rxjs';

const AUTH_STATUS_CACHE_KEY = 'status';
/** Short enough that DeviceTrustService's 3s approval poll always sees a fresh answer, long enough to coalesce the startup burst (app.ts's refreshStatus() racing the device-trust guard's ensureTrusted()) into one request. */
const AUTH_STATUS_CACHE_TTL_MS = 1000;

export interface ArtifactListQuery {
  readonly limit?: number;
  readonly cursor?: string;
  readonly search?: string;
  readonly operation?: string;
}

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

export interface CreateWorkflowStepInput {
  readonly operationId: string;
  readonly params: Readonly<Record<string, unknown>>;
}

export interface CreateWorkflowInput {
  readonly name: string;
  readonly description?: string;
  readonly steps: readonly CreateWorkflowStepInput[];
}

@Injectable({ providedIn: 'root' })
export class ApiClientService {
  private readonly http = inject(HttpClientService);
  private readonly config = inject(API_CONFIG);

  /**
   * The one endpoint cached at this (root, whole-session) scope: auth status is checked
   * repeatedly from independent call sites (the startup guard, `RuntimeStatusService`, the
   * approval poll) that all want the *same* answer at any given moment, so coalescing and a
   * short TTL are a pure win here — see `lru-request-cache.ts` for the mechanism. Lists like
   * tools and workflows deliberately do NOT get this treatment: their pages already decide for
   * themselves when to (re)fetch (`RuntimeStatusService.refreshStatus()`, `RecipesService`), and
   * a cache underneath that would go stale the moment another browser or operator changes the
   * same data — e.g. a workflow list cached here would never notice a workflow created from
   * another device. A page that wants "don't refetch while I'm still mounted" belongs to that
   * page's own service instance, not to this singleton.
   */
  private readonly authStatusCache = new LruRequestCache<string, HttpResponse<AuthStatusResponse>>({
    capacity: 1,
    ttlMs: AUTH_STATUS_CACHE_TTL_MS,
    shouldCache: Either.isRight,
  });

  getAuthStatus$() {
    return this.authStatusCache.get(AUTH_STATUS_CACHE_KEY, () => this.http.get<AuthStatusResponse>(`${this.config.baseUrl}/auth/status`));
  }

  enrollDevice$(name: string, publicKey: string) {
    return this.http.post<DeviceResponse>(`${this.config.baseUrl}/auth/enroll`, { name, publicKey }).pipe(tap(() => this.authStatusCache.clear()));
  }

  listDevices$() {
    return this.http.get<DeviceListResponse>(`${this.config.baseUrl}/auth/devices`);
  }

  renameDevice$(deviceId: string, name: string) {
    return this.http.patch<DeviceResponse>(`${this.config.baseUrl}/auth/devices/${deviceId}`, { name });
  }

  revokeDevice$(deviceId: string) {
    return this.http.delete<RevokeDeviceResponse>(`${this.config.baseUrl}/auth/devices/${deviceId}`).pipe(tap(() => this.authStatusCache.clear()));
  }

  approveDevice$(deviceId: string) {
    return this.http.post<ApproveDeviceResponse>(`${this.config.baseUrl}/auth/devices/${deviceId}/approve`, {}).pipe(tap(() => this.authStatusCache.clear()));
  }

  deleteDevice$(deviceId: string) {
    return this.http.post<DeleteDeviceResponse>(`${this.config.baseUrl}/auth/devices/${deviceId}/delete`, {}).pipe(tap(() => this.authStatusCache.clear()));
  }

  getTools$() {
    return this.http.get<ToolsListResponse>(`${this.config.baseUrl}/tools`);
  }

  createWorkflow$(input: CreateWorkflowInput) {
    return this.http.post<WorkflowResponse>(`${this.config.baseUrl}/workflows`, input);
  }

  listWorkflows$() {
    return this.http.get<WorkflowListResponse>(`${this.config.baseUrl}/workflows`);
  }

  getWorkflow$(id: string) {
    return this.http.get<WorkflowResponse>(`${this.config.baseUrl}/workflows/${id}`);
  }

  deleteWorkflow$(id: string) {
    return this.http.delete<{ deleted: boolean }>(`${this.config.baseUrl}/workflows/${id}`);
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

  inspectMedia$(file: File) {
    const formData = new FormData();
    formData.append('file', file, file.name);

    return this.http.post<MediaInspectOutput>(`${this.config.baseUrl}/tools/media.inspect`, formData);
  }

  /** `video-download.info` takes a URL, not a file — a plain JSON body, unlike every other synchronous tool call above which all carry at least one upload. */
  getVideoInfo$(url: string) {
    return this.http.post<VideoDownloadInfoOutput>(`${this.config.baseUrl}/tools/video-download.info`, { url });
  }

  /**
   * `video-download.download`/`download-audio` also take a URL rather than a file, so this is
   * `submitJob$`'s JSON-body counterpart for that one fileless case — same `POST /jobs/:operationId`
   * route the generic `prepareJobInput` on the server already coerces from either body shape.
   */
  submitVideoDownloadJob$(operationId: 'video-download.download' | 'video-download.download-audio', url: string, format?: string) {
    return this.http.post<JobSubmittedResponse>(`${this.config.baseUrl}/jobs/${operationId}`, format ? { url, format } : { url });
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

  listArtifacts$(query: ArtifactListQuery = {}) {
    const params = new URLSearchParams();
    if (query.limit != null) {
      params.set('limit', String(query.limit));
    }
    if (query.cursor) {
      params.set('cursor', query.cursor);
    }
    if (query.search) {
      params.set('q', query.search);
    }
    if (query.operation) {
      params.set('operation', query.operation);
    }

    const queryString = params.toString();
    return this.http.get<ArtifactListResponse>(`${this.config.baseUrl}/artifacts${queryString ? '?' + queryString : ''}`);
  }

  getArtifact$(id: string) {
    return this.http.get<ArtifactResponse>(`${this.config.baseUrl}/artifacts/${id}`);
  }

  /**
   * Generic job submission for a single file plus arbitrary scalar parameters — the client-side
   * counterpart to the backend's parameter-driven `POST /jobs/:operationId` route. Used by batch
   * mode, which submits N independent jobs (one per file) against one shared settings object,
   * rather than needing a bespoke per-operation method like the tool-specific `submit*Job$` calls.
   */
  submitJob$(operationId: string, file: File, params: Readonly<Record<string, unknown>>) {
    const formData = new FormData();
    formData.append('file', file, file.name);

    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== '') {
        formData.append(key, String(value));
      }
    }

    return this.http.post<JobSubmittedResponse>(`${this.config.baseUrl}/jobs/${operationId}`, formData);
  }

  /**
   * The batch counterpart to `submitJob$`: every file goes into one multipart request against
   * one shared parameter set, and the server creates one independent job per file from it — see
   * `JobsController.submitBatch`. Used by `JobTrackerService.submitBatch$` in place of firing one
   * `submitJob$` request per file, so a batch of N files costs one HTTP round-trip instead of N.
   */
  submitBatchJob$(operationId: string, files: readonly File[], params: Readonly<Record<string, unknown>>) {
    const formData = new FormData();
    for (const file of files) {
      formData.append('file', file, file.name);
    }

    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== '') {
        formData.append(key, String(value));
      }
    }

    return this.http.post<BatchJobSubmittedResponse>(`${this.config.baseUrl}/jobs/${operationId}/batch`, formData);
  }

  /**
   * `<img src>`/`<a href>` can't carry the device-auth signature headers `DeviceAuthGuard`
   * requires for non-local requests, so artifact bytes go through the signed `HttpClient`
   * as a blob instead — see `ArtifactObjectUrlService`, which turns these into object URLs
   * a template can bind directly.
   */
  getArtifactFileBlob$(id: string) {
    return this.http.getBlob(`${this.config.baseUrl}/artifacts/${id}/file`);
  }

  getArtifactDownloadBlob$(id: string) {
    return this.http.getBlob(`${this.config.baseUrl}/artifacts/${id}/download`);
  }

  /** A compressed WebP re-encode of the artifact, for on-screen inspection — independent of whatever format the artifact itself was actually saved in. */
  getArtifactPreviewBlob$(id: string) {
    return this.http.getBlob(`${this.config.baseUrl}/artifacts/${id}/preview`);
  }
}
