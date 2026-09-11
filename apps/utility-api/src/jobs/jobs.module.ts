import { Module } from "@nestjs/common";
import { JobsController } from "./jobs.controller.js";
import { AuthModule } from "../auth/auth.module.js";

@Module({
  imports: [AuthModule],
  controllers: [JobsController],
})
export class JobsModule {}
