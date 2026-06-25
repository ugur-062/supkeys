export function AuthBackdrop() {
  return (
    <>
      {/* grid deseni */}
      <svg
        aria-hidden="true"
        className="absolute inset-0 -z-10 size-full stroke-zinc-200 [mask-image:radial-gradient(38rem_28rem_at_50%_0%,white,transparent)]"
      >
        <defs>
          <pattern
            id="auth-grid"
            width={40}
            height={40}
            x="50%"
            patternUnits="userSpaceOnUse"
          >
            <path d="M.5 40V.5H40" fill="none" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" strokeWidth={0} fill="url(#auth-grid)" />
      </svg>
      {/* yumuşak yüzen gradient */}
      <div
        aria-hidden="true"
        className="rt-float-slow absolute -top-24 left-1/2 -z-10 size-[36rem] -translate-x-1/2 rounded-full bg-gradient-to-tr from-zinc-200/50 to-transparent blur-3xl"
      />
    </>
  );
}
