import type { JobResponse, JobListResponse, JobStatus, JobProgress } from '@utility/protocol';
import type { From } from '@utility/adapter';

export interface JobModelParams {
  readonly id: string;
  readonly operationId: string;
  readonly status: JobStatus;
  readonly progress: JobProgress | null;
  readonly result: unknown | null;
  readonly error: string | null;
  readonly createdAt: string;
  readonly startedAt: string | null;
  readonly completedAt: string | null;
  /** Human-readable label for the ledger tag (e.g. the source filename). Not part of the wire DTO — attached client-side by JobTrackerService at submission time. */
  readonly label?: string;
  /** Groups jobs submitted together as one batch (e.g. N files resized with one settings form). Not part of the wire DTO — attached client-side by JobTrackerService at submission time; the backend has no batch concept, every job is independent. */
  readonly batchId?: string;
}

const ACTIVE_STATUSES: readonly JobStatus[] = ['pending', 'running'];
const TERMINAL_STATUSES: readonly JobStatus[] = ['completed', 'failed', 'cancelled'];

export class JobModel {
  readonly id: string;
  readonly operationId: string;
  readonly status: JobStatus;
  readonly progress: JobProgress | null;
  readonly result: unknown | null;
  readonly error: string | null;
  readonly createdAt: string;
  readonly startedAt: string | null;
  readonly completedAt: string | null;
  readonly label?: string;
  readonly batchId?: string;

  constructor(params: JobModelParams) {
    this.id = params.id;
    this.operationId = params.operationId;
    this.status = params.status;
    this.progress = params.progress;
    this.result = params.result;
    this.error = params.error;
    this.createdAt = params.createdAt;
    this.startedAt = params.startedAt;
    this.completedAt = params.completedAt;
    this.label = params.label;
    this.batchId = params.batchId;
  }

  get isActive(): boolean {
    return ACTIVE_STATUSES.includes(this.status);
  }

  get isTerminal(): boolean {
    return TERMINAL_STATUSES.includes(this.status);
  }

  withLabel(label: string | undefined): JobModel {
    return new JobModel({ ...this, label });
  }

  withBatchId(batchId: string | undefined): JobModel {
    return new JobModel({ ...this, batchId });
  }
}

export const JobModelFromJobResponse: From<JobResponse, JobModel> = {
  from: (dto) => new JobModel(dto),
};

export const JobModelsFromJobListResponse: From<JobListResponse, readonly JobModel[]> = {
  from: (dto) => dto.jobs.map((job) => JobModelFromJobResponse.from(job)),
};
