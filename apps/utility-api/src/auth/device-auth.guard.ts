import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from "@nestjs/common";
import { Request } from "express";
import { DeviceAuthService } from "./device-auth.service.js";
import { isLocalRequest } from "./request-locality.js";

@Injectable()
export class DeviceAuthGuard implements CanActivate {
  constructor(private readonly authService: DeviceAuthService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const isLocal = isLocalRequest(request);

    const deviceId = request.headers["x-device-id"] as string | undefined;
    const timestamp = request.headers["x-timestamp"] as string | undefined;
    const nonce = request.headers["x-nonce"] as string | undefined;
    const signature = request.headers["x-signature"] as string | undefined;

    // If client provides signature headers, verify them
    if (deviceId && timestamp && nonce && signature) {
      const isValid = this.authService.verifySignature({
        deviceId,
        timestamp,
        nonce,
        method: request.method,
        path: request.originalUrl || request.url,
        signature,
      });

      if (!isValid) {
        throw new UnauthorizedException("Invalid device cryptographic signature");
      }

      (request as Request & { deviceId?: string }).deviceId = deviceId;
      return true;
    }

    // If localhost and no signature headers required in local dev
    if (isLocal) {
      return true;
    }

    throw new UnauthorizedException(
      "Device authentication required for non-local requests. Missing device credentials."
    );
  }
}
