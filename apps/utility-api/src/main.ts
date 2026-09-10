import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module.js";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.setGlobalPrefix("api/v1");

  app.enableCors({
    origin: ["http://localhost:4200", "http://127.0.0.1:4200", "http://localhost:3000"],
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
}

bootstrap().catch((err) => {
  console.error("Failed to start Utility API Server:", err);
  process.exit(1);
});
