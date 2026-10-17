import { IsString, MaxLength, MinLength } from "class-validator";

/** `GET company/connections/external-tender-invites?listingId=` (round 5, D3). */
export class ListingEmailInvitesQueryDto {
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  listingId!: string;
}
