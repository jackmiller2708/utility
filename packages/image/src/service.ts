import { Context, Effect, Layer } from "effect";
import sharp from "sharp";
import { ImageFit, ImageFormat } from "@utility/protocol";
import { ImageProcessingError, InvalidImageError } from "./errors.js";

export interface ImageMetadata {
  readonly width?: number;
  readonly height?: number;
  readonly format?: string;
  readonly space?: string;
  readonly channels?: number;
  readonly density?: number;
  readonly hasAlpha?: boolean;
}

export interface ResizeOptions {
  readonly width?: number;
  readonly height?: number;
  readonly fit?: ImageFit;
  readonly position?: string;
  readonly withoutEnlargement?: boolean;
  readonly format?: ImageFormat;
}

export interface ImageService {
  readonly resize: (
    inputPath: string,
    outputPath: string,
    options: ResizeOptions
  ) => Effect.Effect<ImageMetadata, ImageProcessingError | InvalidImageError>;

  readonly getMetadata: (
    inputPath: string
  ) => Effect.Effect<ImageMetadata, InvalidImageError>;
}

export const ImageService = Context.GenericTag<ImageService>("@utility/image/ImageService");

export const SharpImageServiceLive = Layer.succeed(
  ImageService,
  ImageService.of({
    resize: (inputPath: string, outputPath: string, options: ResizeOptions) =>
      Effect.tryPromise({
        try: async () => {
          let pipeline = sharp(inputPath);

          if (options.width || options.height) {
            pipeline = pipeline.resize({
              width: options.width,
              height: options.height,
              fit: options.fit || "inside",
              position: options.position || "center",
              withoutEnlargement: options.withoutEnlargement ?? true,
            });
          }

          if (options.format) {
            switch (options.format) {
              case "jpeg":
                pipeline = pipeline.jpeg({ quality: 85 });
                break;
              case "png":
                pipeline = pipeline.png({ compressionLevel: 8 });
                break;
              case "webp":
                pipeline = pipeline.webp({ quality: 80 });
                break;
              case "avif":
                pipeline = pipeline.avif({ quality: 75 });
                break;
            }
          }

          const info = await pipeline.toFile(outputPath);

          return {
            width: info.width,
            height: info.height,
            format: info.format,
            channels: info.channels,
            size: info.size,
          };
        },
        catch: (cause: unknown) =>
          new ImageProcessingError({
            operation: "resize",
            message: `Failed to resize image at ${inputPath}: ${cause instanceof Error ? cause.message : String(cause)}`,
            cause,
          }),
      }),

    getMetadata: (inputPath: string) =>
      Effect.tryPromise({
        try: async () => {
          const meta = await sharp(inputPath).metadata();
          return {
            width: meta.width,
            height: meta.height,
            format: meta.format,
            space: meta.space,
            channels: meta.channels,
            density: meta.density,
            hasAlpha: meta.hasAlpha,
          };
        },
        catch: (cause: unknown) =>
          new InvalidImageError({
            path: inputPath,
            message: `Failed to extract image metadata from ${inputPath}: ${cause instanceof Error ? cause.message : String(cause)}`,
            cause,
          }),
      }),
  })
);
