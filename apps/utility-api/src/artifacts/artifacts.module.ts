import { Module } from "@nestjs/common";
import { ArtifactsController } from "./artifacts.controller.js";
import { AuthModule } from "../auth/auth.module.js";

@Module({
  imports: [AuthModule],
  controllers: [ArtifactsController],
})
export class ArtifactsModule {}
