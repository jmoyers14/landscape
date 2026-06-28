import type { ReactNode } from "react";
import { SignInButton, SignUpButton } from "@clerk/react";
import { track, WEB_EVENTS } from "../analytics/posthog.ts";

const PHASES = [
  "Irrigation",
  "Concrete Flatwork",
  "Retaining Walls",
  "Planting & Sod",
  "Paving & Flagstone",
  "Low Voltage Lighting",
  "Masonry Walls",
  "BBQ Islands",
  "Patio Covers",
  "Drainage Systems",
  "Iron Fencing",
  "Fire Rings",
  "Ground Cover",
  "Soil Preparation",
  "Mow Curbs",
  "Mulch Installation",
];

const Wordmark = ({ className = "" }: { className?: string }) => (
  <span className={`font-heading tracking-wide ${className}`}>
    Land<span className="text-primary-300">scape</span>
  </span>
);

const PrimaryCTA = ({ children }: { children: ReactNode }) => (
  <SignUpButton mode="modal">
    <button
      onClick={() => track(WEB_EVENTS.SIGNUP_CTA_CLICKED, { location: "hero" })}
      className="rounded-sm bg-primary-600 px-6 py-3 text-sm font-semibold tracking-wide text-white transition-colors hover:bg-primary-500"
    >
      {children}
    </button>
  </SignUpButton>
);

const SecondaryCTA = ({ children }: { children: ReactNode }) => (
  <SignInButton mode="modal">
    <button
      onClick={() => track(WEB_EVENTS.SIGNIN_CTA_CLICKED, { location: "hero" })}
      className="rounded-sm border border-primary-500/30 bg-primary-600/10 px-6 py-3 text-sm font-semibold tracking-wide text-primary-300 transition-colors hover:bg-primary-600/20"
    >
      {children}
    </button>
  </SignInButton>
);

export function LandingScreen() {
  return (
    <div className="flex min-h-screen flex-col bg-grey-50 font-body text-primary-800">
      {/* NAV */}
      <nav className="fixed inset-x-0 top-0 z-50 flex items-center justify-between border-b border-white/10 bg-primary-900/95 px-6 py-5 backdrop-blur-md md:px-12">
        <Wordmark className="text-xl text-grey-50" />
        <div className="flex items-center gap-3">
          <SignInButton mode="modal">
            <button
              onClick={() =>
                track(WEB_EVENTS.SIGNIN_CTA_CLICKED, { location: "nav" })
              }
              className="text-xs font-medium uppercase tracking-[0.08em] text-primary-200 transition-colors hover:text-grey-50"
            >
              Sign in
            </button>
          </SignInButton>
          <SignUpButton mode="modal">
            <button
              onClick={() =>
                track(WEB_EVENTS.SIGNUP_CTA_CLICKED, { location: "nav" })
              }
              className="rounded-full border border-primary-500/30 bg-primary-600/10 px-4 py-1.5 text-xs font-semibold tracking-wide text-primary-300 transition-colors hover:bg-primary-600/20"
            >
              Get Started
            </button>
          </SignUpButton>
        </div>
      </nav>

      {/* HERO */}
      <section className="relative flex flex-1 flex-col items-center justify-center overflow-hidden bg-primary-900 px-6 pb-12 pt-24 text-center md:px-12">
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage:
              "radial-gradient(circle at 1px 1px, rgba(139,175,154,0.06) 1px, transparent 0)",
            backgroundSize: "28px 28px",
          }}
        />
        <div className="relative">
          <span className="mb-5 inline-flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.14em] text-primary-300 before:inline-block before:h-px before:w-4 before:bg-primary-600 after:inline-block after:h-px after:w-4 after:bg-primary-600">
            Landscape &amp; Construction Estimating
          </span>
          <h1 className="font-heading text-[clamp(3rem,5.5vw,5rem)] leading-[1.04] text-grey-50">
            Bid faster.
            <br />
            <em className="not-italic text-primary-300">Bill right.</em>
          </h1>
          <p className="mx-auto mt-5 max-w-[52ch] text-base leading-relaxed text-primary-200 md:text-lg">
            A complete estimating and project management platform built
            specifically for landscape and construction contractors —
            field-tested for 20 years, now in software.
          </p>

          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <PrimaryCTA>Get Started</PrimaryCTA>
            <SecondaryCTA>Sign in</SecondaryCTA>
          </div>
          <p className="mt-3 text-xs tracking-wide text-primary-200">
            Set up your business in minutes. Invite your crew anytime.
          </p>

          <div className="mx-auto mt-7 flex max-w-[520px] flex-wrap justify-center gap-1.5">
            {PHASES.slice(0, 8).map((phase) => (
              <span
                key={phase}
                className="rounded-full border border-primary-500/20 bg-primary-600/10 px-2.5 py-1 font-mono text-[0.62rem] font-medium uppercase tracking-[0.08em] text-primary-300"
              >
                {phase}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* TICKER */}
      <div className="overflow-hidden whitespace-nowrap bg-primary-600 py-3">
        <div className="inline-flex w-max animate-scroll-left motion-reduce:animate-none">
          {[...PHASES, ...PHASES].map((phase, i) => (
            <span key={i} className="flex items-center">
              <span className="px-8 text-[0.72rem] font-semibold uppercase tracking-[0.12em] text-white/90">
                {phase}
              </span>
              <span className="text-[0.5rem] text-white/35">●</span>
            </span>
          ))}
        </div>
      </div>

      {/* FOOTER */}
      <footer className="flex flex-col items-center justify-between gap-3 border-t border-white/10 bg-primary-900 px-6 py-8 text-center md:flex-row md:px-12 md:text-left">
        <Wordmark className="text-lg text-grey-50" />
        <p className="text-sm text-primary-200">
          Built for landscape &amp; construction contractors.
        </p>
      </footer>
    </div>
  );
}
