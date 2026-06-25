import { Injectable } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";

@Injectable()
export class CompanyJwtAuthGuard extends AuthGuard("company-jwt") {}
