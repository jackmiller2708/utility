import { Controller, Get, Post, Patch, Delete, Param, Body, Req, UseGuards, BadRequestException, NotFoundException, ForbiddenException } from "@nestjs/common";
import type { Request } from "express";
import { DeviceAuthService } from "./device-auth.service.js";
import { DeviceAuthGuard } from "./device-auth.guard.js";
import { isLocalRequest } from "./request-locality.js";

type AuthenticatedRequest = Request & { deviceId?: string };

@Controller("auth")
export class AuthController {
  constructor(private readonly authService: DeviceAuthService) {}

  @Get("status")
  getStatus(@Req() req: Request) {
    const isLocal = isLocalRequest(req);
    const deviceId = req.headers["x-device-id"] as string | undefined;
    const device = deviceId ? this.authService.getDevice(deviceId) : undefined;
    const trusted = !!device && device.approved && !device.revoked;

    return {
      authenticated: isLocal || trusted,
      isLocal,
      device: device
        ? {
            deviceId: device.deviceId,
            name: device.name,
            publicKey: device.publicKey,
            createdAt: device.createdAt,
            lastSeenAt: device.lastSeenAt,
            revoked: device.revoked,
            revokedAt: device.revokedAt,
            approved: device.approved,
          }
        : undefined,
    };
  }

  @Post("enroll")
  async enrollDevice(
    @Body() body: { name: string; publicKey: string },
    @Req() req: Request
  ) {
    if (!body?.name || !body?.publicKey) {
      throw new BadRequestException("Device name and publicKey are required");
    }

    // Enrolling from `isLocal` (physically at the server) auto-approves —
    // there's no one else to ask. Every other enrollment starts pending
    // until the operator approves it from the Devices page.
    const device = await this.authService.registerDevice(
      body.name,
      body.publicKey,
      isLocalRequest(req)
    );

    return {
      deviceId: device.deviceId,
      name: device.name,
      publicKey: device.publicKey,
      createdAt: device.createdAt,
      lastSeenAt: device.lastSeenAt,
      revoked: device.revoked,
      revokedAt: device.revokedAt,
      approved: device.approved,
    };
  }

  @UseGuards(DeviceAuthGuard)
  @Get("devices")
  listDevices() {
    return this.authService.listDevices();
  }

  @Post("devices/:id/approve")
  async approveDevice(@Param("id") id: string, @Req() req: Request) {
    if (!isLocalRequest(req)) {
      throw new ForbiddenException("Only the server operator can approve a new device");
    }

    const device = await this.authService.approveDevice(id);
    if (!device) {
      throw new NotFoundException("Device not found");
    }

    return { deviceId: device.deviceId, approved: true };
  }

  @Post("devices/:id/delete")
  async deleteDevice(@Param("id") id: string, @Req() req: Request) {
    if (!isLocalRequest(req)) {
      throw new ForbiddenException("Only the server operator can permanently delete a device");
    }

    const result = await this.authService.deleteDevice(id);
    if (result === "not-found") {
      throw new NotFoundException("Device not found");
    }
    if (result === "not-revoked") {
      throw new BadRequestException("Only a revoked device can be deleted");
    }

    return { deviceId: id, deleted: true };
  }

  @UseGuards(DeviceAuthGuard)
  @Patch("devices/:id")
  async renameDevice(@Param("id") id: string, @Body() body: { name: string }, @Req() req: AuthenticatedRequest) {
    this.assertSelfOrLocal(id, req);

    if (!body?.name?.trim()) {
      throw new BadRequestException("Device name is required");
    }

    const device = await this.authService.renameDevice(id, body.name.trim());
    if (!device) {
      throw new NotFoundException("Device not found");
    }

    return {
      deviceId: device.deviceId,
      name: device.name,
      publicKey: device.publicKey,
      createdAt: device.createdAt,
      lastSeenAt: device.lastSeenAt,
      revoked: device.revoked,
    };
  }

  @UseGuards(DeviceAuthGuard)
  @Delete("devices/:id")
  async revokeDevice(@Param("id") id: string, @Req() req: AuthenticatedRequest) {
    this.assertSelfOrLocal(id, req);

    const device = await this.authService.revokeDevice(id);
    if (!device) {
      throw new NotFoundException("Device not found");
    }

    return { deviceId: device.deviceId, revoked: true };
  }

  /**
   * A device may only manage itself over a signed request — `DeviceAuthGuard`
   * only proves "this is *some* trusted device," not "this device owns the
   * one being changed," so without this check any enrolled device could
   * rename or revoke any other. `req.deviceId` is unset only when the guard
   * passed via its `isLocal` bypass (physically at the server), which stays
   * a full admin path — everything else is self-service only.
   */
  private assertSelfOrLocal(targetDeviceId: string, req: AuthenticatedRequest): void {
    if (req.deviceId && req.deviceId !== targetDeviceId) {
      throw new ForbiddenException("A device can only manage itself");
    }
  }
}
