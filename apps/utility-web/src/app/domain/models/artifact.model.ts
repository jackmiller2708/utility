export interface ArtifactModel {
  readonly id: string;
  readonly name: string;
  readonly mimeType: string;
  readonly size: number;
  readonly checksum?: string;
  readonly createdAt: string;
}

export interface ArtifactFileDetails {
  readonly file: File;
  readonly previewUrl: string;
  readonly name: string;
  readonly size: number;
  readonly width: number;
  readonly height: number;
}
