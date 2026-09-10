import { Brand } from "effect";

export type FileId = string & Brand.Brand<"FileId">;
export const FileId = Brand.nominal<FileId>();

export type ArtifactId = string & Brand.Brand<"ArtifactId">;
export const ArtifactId = Brand.nominal<ArtifactId>();

export type WorkspaceId = string & Brand.Brand<"WorkspaceId">;
export const WorkspaceId = Brand.nominal<WorkspaceId>();

export type DeviceId = string & Brand.Brand<"DeviceId">;
export const DeviceId = Brand.nominal<DeviceId>();
