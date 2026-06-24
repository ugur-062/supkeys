import { Controller, Get, Param, Query, UseGuards } from "@nestjs/common";
import { AdminJwtAuthGuard } from "../admin-auth/guards/admin-jwt-auth.guard";
import { AdminMessagesService } from "./admin-messages.service";

@Controller("admin/threads")
@UseGuards(AdminJwtAuthGuard)
export class AdminMessagesController {
  constructor(private readonly service: AdminMessagesService) {}

  @Get()
  list(
    @Query("search") search?: string,
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
  ): Promise<unknown> {
    return this.service.listThreads({ search, page, pageSize });
  }

  @Get(":id")
  getThread(@Param("id") id: string): Promise<unknown> {
    return this.service.getThread(id);
  }
}
