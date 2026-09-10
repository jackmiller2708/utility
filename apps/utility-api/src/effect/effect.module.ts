import { Module, Global } from "@nestjs/common";
import { EffectRuntimeService } from "./effect-runtime.service.js";

@Global()
@Module({
  providers: [EffectRuntimeService],
  exports: [EffectRuntimeService],
})
export class EffectModule {}
