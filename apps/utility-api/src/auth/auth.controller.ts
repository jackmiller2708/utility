import {
  Controller,
  Get,
  Post,
  Body,
  Req,
  BadRequestException,
} from "@nestjs/common";
import type { Request } from "express";
import { DeviceAuthService } from "./device-auth.service.js";

@Controller("auth")
export class AuthController {
  constructor(private readonly authService: DeviceAuthService) {}

  @Get("status")
  getStatus(@Req() req: Request) {
    const clientIp = req.ip || req.socket?.remoteAddress || "";
    const isLocal =
      clientIp === "127.0.0.1" ||
      clientIp === "::1" ||
      clientIp === "::ffff:127.0.0.1" ||
      clientIp === "localhost" ||
      req.hostname === "localhost" ||
      req.hostname === "127.0.0.1";

    const deviceId = req.headers["x-device-id"] as string | undefined;
    const device = deviceId ? this.authService.getDevice(deviceId) : undefined;

    return {
      authenticated: isLocal || !!device,
      isLocal,
      device: device
        ? {
            deviceId: device.deviceId,
            name: device.name,
            publicKey: device.publicKey,
            createdAt: device.createdAt,
            lastSeenAt: device.lastSeenAt,
            revoked: device.revoked,
          }
        : undefined,
    };
  }

  @Post("enroll")
  async enrollDevice(
    @Body() body: { name: string; publicKey: string }
  ) {
    if (!body?.name || !body?.publicKey) {
      throw new BadRequestException("Device name and publicKey are required");
    }

    const device = await this.authService.registerDevice(
      body.name,
      body.publicKey
    );

    return {
      deviceId: device.deviceId,
      name: device.name,
      publicKey: device.publicKey,
      createdAt: device.createdAt,
    };
  }

  @Get("devices")
  listDevices() {
    return this.authService.listDevices();
  }
}
