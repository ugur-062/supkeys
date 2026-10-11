import { Global, Module } from "@nestjs/common";
import { SessionRevocationScheduler } from "./session-revocation.scheduler";
import { SessionRevocationService } from "./session-revocation.service";

/**
 * @Global — iki realm'in stratejisi + çıkış uçları, /rt geçidi ve kök
 * AuthCookieInterceptor aynı örneği (aynı pozitif önbelleği) kullanır.
 */
@Global()
@Module({
  providers: [SessionRevocationService, SessionRevocationScheduler],
  exports: [SessionRevocationService],
})
export class SessionRevocationModule {}
