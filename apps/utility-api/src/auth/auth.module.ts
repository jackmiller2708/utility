import { Module } from "@nestjs/common";
import { DeviceAuthService } from "./device-auth.service.js";
import { DeviceAuthGuard } from "./device-auth.guard.js";
import { AuthController } from "./auth.controller.js";

@Module({
  controllers: [AuthController],
  providers: [DeviceAuthService, DeviceAuthGuard],
  exports: [DeviceAuthService, DeviceAuthGuard],
})
export class AuthModule {}
