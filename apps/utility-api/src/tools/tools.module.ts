import { Module } from "@nestjs/common";
import { ToolsController } from "./tools.controller.js";
import { AuthModule } from "../auth/auth.module.js";

@Module({
  imports: [AuthModule],
  controllers: [ToolsController],
})
export class ToolsModule {}
