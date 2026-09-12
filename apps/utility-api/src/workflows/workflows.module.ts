import { Module } from "@nestjs/common";
import { WorkflowsController } from "./workflows.controller.js";
import { AuthModule } from "../auth/auth.module.js";

@Module({
  imports: [AuthModule],
  controllers: [WorkflowsController],
})
export class WorkflowsModule {}
