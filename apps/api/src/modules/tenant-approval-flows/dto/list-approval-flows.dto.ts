import { IsEnum, IsOptional } from "class-validator";
import {
  ApprovalFlowStatusDto,
  ApprovalFlowTypeDto,
} from "./create-approval-flow.dto";

export class ListApprovalFlowsDto {
  @IsOptional()
  @IsEnum(ApprovalFlowTypeDto)
  type?: ApprovalFlowTypeDto;

  @IsOptional()
  @IsEnum(ApprovalFlowStatusDto)
  status?: ApprovalFlowStatusDto;
}
