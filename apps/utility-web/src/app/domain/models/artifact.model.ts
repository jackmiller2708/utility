import type { ImageResizeOutput, PdfRenderPagesOutput, PdfExtractImagesOutput, PdfSplitOutput, PdfMergeOutput, ArtifactResponse, MediaThumbnailOutput, MediaExtractAudioOutput, MediaTranscodeOutput } from '@utility/protocol';
import type { From } from '@utility/adapter';

export interface ArtifactModelParams {
  readonly id: string;
  readonly name: string;
  readonly mimeType: string;
  readonly size: number;
  readonly checksum?: string;
  readonly createdAt: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export class ArtifactModel {
  readonly id: string;
  readonly name: string;
  readonly mimeType: string;
  readonly size: number;
  readonly checksum?: string;
  readonly createdAt: string;
  readonly metadata?: Readonly<Record<string, unknown>>;

  constructor(params: ArtifactModelParams) {
    this.id = params.id;
    this.name = params.name;
    this.mimeType = params.mimeType;
    this.size = params.size;
    this.checksum = params.checksum;
    this.createdAt = params.createdAt;
    this.metadata = params.metadata;
  }

  /** The operation that produced this artifact (e.g. "image.resize"), when known — attached by every operation at save time. */
  get sourceOperation(): string | null {
    const op = this.metadata?.['operation'];
    return typeof op === 'string' ? op : null;
  }
}

export const ArtifactModelFromImageResizeOutput: From<ImageResizeOutput, ArtifactModel> = {
  from: (dto) => new ArtifactModel({
    id: dto.artifact.id,
    name: dto.artifact.name,
    mimeType: dto.artifact.mimeType,
    size: dto.artifact.size,
    checksum: dto.artifact.checksum,
    createdAt: dto.artifact.createdAt,
  }),
};

export const ArtifactModelsFromPdfRenderPagesOutput: From<PdfRenderPagesOutput, readonly ArtifactModel[]> = {
  from: (dto) => dto.pages.map((artifact) => new ArtifactModel(artifact)),
};

export const ArtifactModelsFromPdfExtractImagesOutput: From<PdfExtractImagesOutput, readonly ArtifactModel[]> = {
  from: (dto) => dto.images.map((artifact) => new ArtifactModel(artifact)),
};

export const ArtifactModelsFromPdfSplitOutput: From<PdfSplitOutput, readonly ArtifactModel[]> = {
  from: (dto) => dto.files.map((artifact) => new ArtifactModel(artifact)),
};

export const ArtifactModelFromPdfMergeOutput: From<PdfMergeOutput, ArtifactModel> = {
  from: (dto) => new ArtifactModel(dto.artifact),
};

export const ArtifactModelFromMediaThumbnailOutput: From<MediaThumbnailOutput, ArtifactModel> = {
  from: (dto) => new ArtifactModel(dto.artifact),
};

export const ArtifactModelFromMediaExtractAudioOutput: From<MediaExtractAudioOutput, ArtifactModel> = {
  from: (dto) => new ArtifactModel(dto.artifact),
};

export const ArtifactModelFromMediaTranscodeOutput: From<MediaTranscodeOutput, ArtifactModel> = {
  from: (dto) => new ArtifactModel(dto.artifact),
};

export const ArtifactModelFromArtifactResponse: From<ArtifactResponse, ArtifactModel> = {
  from: (dto) => new ArtifactModel(dto),
};

export const ArtifactModelsFromArtifactResponseList: From<readonly ArtifactResponse[], readonly ArtifactModel[]> = {
  from: (dto) => dto.map((artifact) => ArtifactModelFromArtifactResponse.from(artifact)),
};

export interface ArtifactFileDetails {
  readonly file: File;
  readonly previewUrl: string;
  readonly name: string;
  readonly size: number;
  readonly width: number;
  readonly height: number;
}
