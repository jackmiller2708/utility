import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  NotFoundException,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { Effect } from "effect";
import { DeviceAuthGuard } from "../auth/device-auth.guard.js";
import { EffectRuntimeService } from "../effect/effect-runtime.service.js";
import { ToolRegistry } from "@utility/toolkit";
import { FileSystem, WorkspaceManager } from "@utility/runtime";
import { ImageFit, ImageFormat } from "@utility/protocol";

export interface MulterUploadedFile {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

@UseGuards(DeviceAuthGuard)
@Controller("tools")
export class ToolsController {
  constructor(private readonly effectRuntime: EffectRuntimeService) {}

  @Get()
  async getTools() {
    return this.effectRuntime.runPromise(
      Effect.gen(function* () {
        const registry = yield* ToolRegistry;
        return yield* registry.getToolsInfo();
      })
    );
  }

  @Post("image.resize")
  @UseInterceptors(FileInterceptor("file"))
  async resizeImage(
    @UploadedFile() file: MulterUploadedFile,
    @Body()
    body: {
      width?: string | number;
      height?: string | number;
      fit?: string;
      position?: string;
      withoutEnlargement?: string | boolean;
      format?: string;
    }
  ) {
    if (!file) {
      throw new BadRequestException("An image file is required");
    }

    const width = body.width ? parseInt(String(body.width), 10) : undefined;
    const height = body.height ? parseInt(String(body.height), 10) : undefined;
    const fit = body.fit as ImageFit | undefined;
    const position = body.position;
    const withoutEnlargement =
      body.withoutEnlargement === "true" ||
      body.withoutEnlargement === true ||
      body.withoutEnlargement === undefined;
    const format = body.format as ImageFormat | undefined;

    return this.effectRuntime.runPromise(
      Effect.gen(function* () {
        const registry = yield* ToolRegistry;
        const wsManager = yield* WorkspaceManager;
        const fs = yield* FileSystem;

        const op = yield* registry.getOperation("image.resize");
        if (!op) {
          return yield* Effect.fail(new NotFoundException("Operation image.resize not found"));
        }

        return yield* wsManager.withWorkspace((ws) =>
          Effect.gen(function* () {
            // Write input file to workspace input folder
            const filename = file.originalname || "input_image.png";
            const inputPath = ws.resolveInputPath(filename);
            yield* fs.write(inputPath, file.buffer);

            // Execute tool operation
            return yield* op.execute(
              {
                file: filename,
                width,
                height,
                fit,
                position,
                withoutEnlargement,
                format,
              },
              { workspace: ws }
            );
          })
        );
      })
    );
  }

  @Post(":operationId")
  @UseInterceptors(FileInterceptor("file"))
  async executeOperation(
    @Param("operationId") operationId: string,
    @UploadedFile() file?: MulterUploadedFile,
    @Body() body: Record<string, unknown> = {}
  ) {
    if (operationId === "image.resize") {
      if (!file) {
        throw new BadRequestException("An image file is required");
      }
      return this.resizeImage(file, body);
    }

    return this.effectRuntime.runPromise(
      Effect.gen(function* () {
        const registry = yield* ToolRegistry;
        const wsManager = yield* WorkspaceManager;
        const fs = yield* FileSystem;

        const op = yield* registry.getOperation(operationId);
        if (!op) {
          return yield* Effect.fail(
            new NotFoundException(`Operation ${operationId} not found`)
          );
        }

        return yield* wsManager.withWorkspace((ws) =>
          Effect.gen(function* () {
            let input = { ...body };
            if (file) {
              const filename = file.originalname || "input_file";
              const inputPath = ws.resolveInputPath(filename);
              yield* fs.write(inputPath, file.buffer);
              input = { ...input, file: filename };
            }

            return yield* op.execute(input, { workspace: ws });
          })
        );
      })
    );
  }
}
