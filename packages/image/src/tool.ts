import { Effect } from "effect";
import { Path } from "@effect/platform";
import {
  ImageResizeInput,
  ImageResizeInputSchema,
  ImageResizeOutput,
  ImageResizeOutputSchema,
} from "@utility/protocol";
import { ArtifactStore } from "@utility/runtime";
import { createTool, Operation } from "@utility/toolkit";
import { Artifact } from "@utility/domain";
import { ImageService } from "./service.js";

export const resizeOperation: Operation<
  ImageResizeInput,
  ImageResizeOutput,
  unknown,
  ImageService | ArtifactStore | Path.Path
> = {
  id: "image.resize",
  name: "Resize Image",
  description: "Resize an image to target dimensions while maintaining or modifying aspect ratio.",
  parameters: [
    {
      name: "file",
      label: "Input Image",
      type: "file",
      required: true,
      description: "The image file to resize",
    },
    {
      name: "width",
      label: "Width (px)",
      type: "number",
      required: false,
      description: "Target width in pixels",
      min: 1,
      max: 16384,
    },
    {
      name: "height",
      label: "Height (px)",
      type: "number",
      required: false,
      description: "Target height in pixels",
      min: 1,
      max: 16384,
    },
    {
      name: "fit",
      label: "Fit Mode",
      type: "select",
      required: false,
      defaultValue: "inside",
      options: ["inside", "cover", "contain", "fill", "outside"],
      description: "How the image should be resized to fit the target dimensions",
    },
    {
      name: "withoutEnlargement",
      label: "Do not enlarge",
      type: "boolean",
      required: false,
      defaultValue: true,
      description: "Do not scale up if the image is smaller than the target dimensions",
    },
    {
      name: "format",
      label: "Output Format",
      type: "select",
      required: false,
      options: ["jpeg", "png", "webp", "avif"],
      description: "Optionally convert format during resize",
    },
    {
      name: "quality",
      label: "Compression Quality",
      type: "number",
      required: false,
      defaultValue: 80,
      min: 1,
      max: 100,
      description: "Compression quality percentage for lossy formats (WebP, JPEG, AVIF)",
    },
  ],
  inputSchema: ImageResizeInputSchema,
  outputSchema: ImageResizeOutputSchema,
  execute: (input: ImageResizeInput, context) =>
    Effect.gen(function* () {
      const imageService = yield* ImageService;
      const artifactStore = yield* ArtifactStore;
      const path = yield* Path.Path;

      const inputFilePath = context.workspace.resolveInputPath(input.file);
      const parsed = path.parse(input.file);
      const ext = input.format ? `.${input.format}` : parsed.ext || ".png";
      const outputFilename = `${parsed.name}_resized${ext}`;
      const outputFilePath = context.workspace.allocateOutputPath(outputFilename);

      const meta = yield* imageService.resize(inputFilePath, outputFilePath, {
        width: input.width,
        height: input.height,
        fit: input.fit,
        position: input.position,
        withoutEnlargement: input.withoutEnlargement,
        format: input.format,
        quality: input.quality,
      });

      const artifact = yield* artifactStore.saveArtifact({
        name: outputFilename,
        sourcePath: outputFilePath,
        metadata: {
          width: meta.width,
          height: meta.height,
          format: meta.format,
          operation: "image.resize",
        },
      });

      return {
        artifact,
      };
    }),
  // `output.artifact` is always the real domain `Artifact` from `ArtifactStore.saveArtifact`
  // above; the output schema only widens its `id` to `string` for the wire.
  producesArtifact: (output) => output.artifact as Artifact,
};

export const imageTool = createTool({
  id: "image",
  name: "Image Processing",
  description: "High performance image resizing, conversion, and optimization.",
  category: "Media",
  operations: [resizeOperation],
});
