import type { Request } from "express";

/**
 * Whether a request reached this server without leaving the machine —
 * the one path treated as the server operator, physically present, and
 * therefore trusted with actions (approving a new device, managing any
 * device) that a signed-but-remote request never gets on its own.
 * Shared by `DeviceAuthGuard`, `AuthController.getStatus`, `enrollDevice`,
 * and `approveDevice` — previously duplicated across the first two, which
 * is exactly the kind of drift risk security-sensitive logic shouldn't have.
 */
export function isLocalRequest(req: Request): boolean {
  const clientIp = req.ip || req.socket?.remoteAddress || "";
  return (
    clientIp === "127.0.0.1" ||
    clientIp === "::1" ||
    clientIp === "::ffff:127.0.0.1" ||
    clientIp === "localhost" ||
    req.hostname === "localhost" ||
    req.hostname === "127.0.0.1"
  );
}
