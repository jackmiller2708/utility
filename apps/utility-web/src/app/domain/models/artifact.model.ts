import type { ImageResizeOutput, PdfRenderPagesOutput, PdfExtractImagesOutput, PdfSplitOutput, PdfMergeOutput } from '@utility/protocol';
import type { From } from '@utility/adapter';

export interface ArtifactModelParams {
  readonly id: string;
  readonly name: string;
  readonly mimeType: string;
  readonly size: number;
  readonly checksum?: string;
  readonly createdAt: string;
}

export class ArtifactModel {
  readonly id: string;
  readonly name: string;
  readonly mimeType: string;
  readonly size: number;
  readonly checksum?: string;
  readonly createdAt: string;

  constructor(params: ArtifactModelParams) {
    this.id = params.id;
    this.name = params.name;
    this.mimeType = params.mimeType;
    this.size = params.size;
    this.checksum = params.checksum;
    this.createdAt = params.createdAt;
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

export interface ArtifactFileDetails {
  readonly file: File;
  readonly previewUrl: string;
  readonly name: string;
  readonly size: number;
  readonly width: number;
  readonly height: number;
}
