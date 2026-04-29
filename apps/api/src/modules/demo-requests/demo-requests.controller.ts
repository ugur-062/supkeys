import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Ip,
  Post,
} from "@nestjs/common";
import { DemoRequestsService } from "./demo-requests.service";
import { CreateDemoRequestDto } from "./dto/create-demo-request.dto";

@Controller("demo-requests")
export class DemoRequestsController {
  constructor(private readonly service: DemoRequestsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateDemoRequestDto, @Ip() ip: string) {
    return this.service.create(dto, ip);
  }
}
