import { NestFactory } from "@nestjs/core";
import * as http from "node:http";
import { AppModule } from "./app.module.js";
import { EffectRuntimeService } from "./effect/effect-runtime.service.js";
import { DeviceAuthService } from "./auth/device-auth.service.js";
import { metricsRegistry, refreshAppMetrics } from "./metrics/metrics.registry.js";

/**
 * A separate raw HTTP server, not a Nest route: it must never be reachable through Caddy's
 * `handle /api/*` proxy, which forwards every route this app serves to both the LAN and the
 * public Tailscale Funnel listener (see docs/tailscale-funnel-setup.md). This port is never
 * published to the host or given a Caddy route, so only other containers on the Docker
 * "internal" network -- i.e. Prometheus -- can ever reach it.
 */
function startMetricsServer(effectRuntime: EffectRuntimeService, deviceAuth: DeviceAuthService) {
  const port = process.env.METRICS_PORT ? parseInt(process.env.METRICS_PORT, 10) : 9464;

  const server = http.createServer((req, res) => {
    if (req.url !== "/metrics") {
      res.writeHead(404).end();
      return;
    }

    refreshAppMetrics(effectRuntime, deviceAuth)
      .then(() => metricsRegistry.metrics())
      .then((body) => {
        res.writeHead(200, { "Content-Type": metricsRegistry.contentType });
        res.end(body);
      })
      .catch((err) => {
        res.writeHead(500).end(err instanceof Error ? err.message : String(err));
      });
  });

  server.listen(port, "0.0.0.0", () => {
    console.log(`Metrics server listening on :${port}/metrics (internal only)`);
  });
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.setGlobalPrefix("api/v1");

  const corsOrigins = process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(",").map((origin) => origin.trim())
    : ["http://localhost:4200", "http://127.0.0.1:4200", "http://localhost:3000"];

  app.enableCors({
    origin: corsOrigins,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "x-device-id",
      "x-timestamp",
      "x-nonce",
      "x-signature",
    ],
    credentials: true,
  });

  const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
  const host = process.env.HOST || "127.0.0.1";

  await app.listen(port, host);
  console.log(`Utility API Server running at http://${host}:${port}/api/v1`);

  startMetricsServer(app.get(EffectRuntimeService), app.get(DeviceAuthService));
}

bootstrap().catch((err) => {
  console.error("Failed to start Utility API Server:", err);
  process.exit(1);
});
