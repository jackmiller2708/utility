import { Module } from "@nestjs/common";
import { EffectModule } from "./effect/effect.module.js";
import { AuthModule } from "./auth/auth.module.js";
import { ToolsModule } from "./tools/tools.module.js";
import { ArtifactsModule } from "./artifacts/artifacts.module.js";

@Module({
  imports: [EffectModule, AuthModule, ToolsModule, ArtifactsModule],
})
export class AppModule {}
