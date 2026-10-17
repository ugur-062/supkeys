import { IsIn, IsString, Matches, MaxLength, MinLength } from "class-validator";
import {
  PUSH_PLATFORMS,
  PUSH_TOKEN_MAX_LENGTH,
  PUSH_TOKEN_PATTERN,
  type PushPlatform,
} from "../push-device.service";

export class RegisterPushDeviceDto {
  /** FCM registration token; anything else (raw APNs token, junk) is a 400. */
  @IsString()
  @MaxLength(PUSH_TOKEN_MAX_LENGTH)
  @Matches(PUSH_TOKEN_PATTERN)
  token!: string;

  @IsIn(PUSH_PLATFORMS)
  platform!: PushPlatform;
}

export class UnregisterPushDeviceDto {
  @IsString()
  @MinLength(1)
  @MaxLength(PUSH_TOKEN_MAX_LENGTH)
  token!: string;
}
