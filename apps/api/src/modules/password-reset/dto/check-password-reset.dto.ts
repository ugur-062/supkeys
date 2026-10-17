import { IsString, MaxLength } from "class-validator";

/**
 * Body of the read-only link check (arayuz testi 2026-10 login-16).
 *
 * Only the shape is validated here. A string that is not a real token (too
 * short, too long, not hex) is simply an unknown token, so the answer is
 * `{ valid: false }` and not a 400: the page asks "can this link still be
 * used?" and shows the invalid-link card for any "no".
 */
export class CheckPasswordResetDto {
  @IsString()
  @MaxLength(200)
  token!: string;
}
