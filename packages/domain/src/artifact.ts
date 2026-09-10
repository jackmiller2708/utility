import type { ArtifactId } from "./brands.js";

export type ArtifactKind = "file" | "directory";

export interface Artifact {
  readonly id: ArtifactId;
  readonly name: string;
  readonly kind: ArtifactKind;
  readonly mimeType: string;
  readonly size: number;
  readonly createdAt: string;
  readonly checksum?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}
