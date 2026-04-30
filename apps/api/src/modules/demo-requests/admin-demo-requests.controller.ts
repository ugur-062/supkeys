import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { AdminJwtAuthGuard } from "../admin-auth/guards/admin-jwt-auth.guard";
import { DemoRequestsService } from "./demo-requests.service";
import { ListDemoRequestsDto } from "./dto/list-demo-requests.dto";
import { SendInviteDto } from "./dto/send-invite.dto";
import { UpdateDemoRequestDto } from "./dto/update-demo-request.dto";

@Controller("admin/demo-requests")
@UseGuards(AdminJwtAuthGuard)
export class AdminDemoRequestsController {
  constructor(private readonly service: DemoRequestsService) {}

  @Get()
  list(@Query() query: ListDemoRequestsDto) {
    return this.service.list(query);
  }

  @Get("stats")
  stats() {
    return this.service.stats();
  }

  @Get(":id")
  findOne(@Param("id") id: string) {
    return this.service.findOne(id);
  }

  @Patch(":id")
  update(@Param("id") id: string, @Body() dto: UpdateDemoRequestDto) {
    return this.service.update(id, dto);
  }

  @Post(":id/send-invite")
  @HttpCode(HttpStatus.OK)
  sendInvite(@Param("id") id: string, @Body() dto: SendInviteDto) {
    return this.service.sendInvite(id, dto);
  }
}
