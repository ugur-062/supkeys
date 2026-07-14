/**
 * WebhookSignatureGuard — #6 config-matrix (fail-closed bypass).
 *
 * Secret yokken imza-doğrulama bypass'ı YALNIZ açıkça development/test +
 * ALLOW_INSECURE_WEBHOOK=true iken açılır. NODE_ENV unset ya da
 * "staging"/"prod" gibi tanınmayan değerde bypass YOK → 401.
 */
import { UnauthorizedException, type ExecutionContext } from "@nestjs/common";
import type { ConfigService } from "@nestjs/config";
import { WebhookSignatureGuard } from "../../src/modules/resend-webhook/guards/webhook-signature.guard";

/** Sabit env map'inden okuyan minimal ConfigService taklidi. */
function configFor(env: Record<string, string | undefined>): ConfigService {
  return {
    get: (key: string) => env[key],
  } as unknown as ConfigService;
}

/** Boş secret senaryosunda header/rawBody'ye ulaşılmaz — minimal request yeter. */
function ctx(): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ headers: {}, rawBody: undefined }),
    }),
  } as unknown as ExecutionContext;
}

describe("WebhookSignatureGuard — secret yokken bypass matrisi", () => {
  it("NODE_ENV unset + ALLOW_INSECURE_WEBHOOK=true → bypass YOK (401)", () => {
    const g = new WebhookSignatureGuard(
      configFor({ ALLOW_INSECURE_WEBHOOK: "true" }), // NODE_ENV yok
    );
    expect(() => g.canActivate(ctx())).toThrow(UnauthorizedException);
  });

  it('tanınmayan env ("staging"/"prod") + flag → bypass YOK (401)', () => {
    for (const NODE_ENV of ["staging", "prod", "Production"]) {
      const g = new WebhookSignatureGuard(
        configFor({ NODE_ENV, ALLOW_INSECURE_WEBHOOK: "true" }),
      );
      expect(() => g.canActivate(ctx())).toThrow(UnauthorizedException);
    }
  });

  it("production + flag → bypass YOK (401)", () => {
    const g = new WebhookSignatureGuard(
      configFor({ NODE_ENV: "production", ALLOW_INSECURE_WEBHOOK: "true" }),
    );
    expect(() => g.canActivate(ctx())).toThrow(UnauthorizedException);
  });

  it("development + flag → bypass VAR (true)", () => {
    const g = new WebhookSignatureGuard(
      configFor({ NODE_ENV: "development", ALLOW_INSECURE_WEBHOOK: "true" }),
    );
    expect(g.canActivate(ctx())).toBe(true);
  });

  it("test + flag → bypass VAR (true)", () => {
    const g = new WebhookSignatureGuard(
      configFor({ NODE_ENV: "test", ALLOW_INSECURE_WEBHOOK: "true" }),
    );
    expect(g.canActivate(ctx())).toBe(true);
  });

  it("development ama flag YOK → bypass YOK (401)", () => {
    const g = new WebhookSignatureGuard(configFor({ NODE_ENV: "development" }));
    expect(() => g.canActivate(ctx())).toThrow(UnauthorizedException);
  });
});
