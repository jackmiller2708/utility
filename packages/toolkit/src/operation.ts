import { Effect, Schema } from "effect";
import { ToolParameter } from "@utility/protocol";
import { WorkspaceInstance } from "@utility/runtime";
import { Artifact } from "@utility/domain";
import { ProgressReporter } from "./job.js";

export interface OperationContext {
  readonly workspace: WorkspaceInstance;
  /** Present when the operation is running as an async job; absent (undefined) when run synchronously. */
  readonly reportProgress?: ProgressReporter;
}

/** Pulls the single output artifact out of an operation's output, when it has exactly one. */
export type ArtifactExtractor<O> = (output: O) => Artifact;

export interface Operation<I, O, E = unknown, R = never> {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly parameters: readonly ToolParameter[];
  readonly inputSchema: Schema.Schema<I>;
  readonly outputSchema: Schema.Schema<O>;
  readonly execute: (input: I, context: OperationContext) => Effect.Effect<O, E, R>;
  /**
   * Present only on operations that take one file and emit exactly one artifact — the
   * contract a workflow step requires to chain into the next step. Absent on fan-out or
   * metadata-only operations (e.g. pdf.render-pages, pdf.inspect), which can't be chained.
   */
  readonly producesArtifact?: ArtifactExtractor<O>;
}
