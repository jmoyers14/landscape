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
  <span className={`font-display tracking-wide ${className}`}>
    Land<span className="text-gold-light">scape</span>
  </span>
);

const PrimaryCTA = ({ children }: { children: ReactNode }) => (
  <SignUpButton mode="modal">
    <button
      onClick={() => track(WEB_EVENTS.SIGNUP_CTA_CLICKED, { location: "hero" })}
      className="rounded-sm bg-gold px-6 py-3 text-sm font-semibold tracking-wide text-white transition-colors hover:bg-gold-light"
    >
      {children}
    </button>
  </SignUpButton>
);

const SecondaryCTA = ({ children }: { children: ReactNode }) => (
  <SignInButton mode="modal">
    <button
      onClick={() => track(WEB_EVENTS.SIGNIN_CTA_CLICKED, { location: "hero" })}
      className="rounded-sm border border-gold/30 bg-gold/10 px-6 py-3 text-sm font-semibold tracking-wide text-gold-light transition-colors hover:bg-gold/20"
    >
      {children}
    </button>
  </SignInButton>
);

export function LandingScreen() {
  return (
    <div className="flex min-h-screen flex-col bg-limestone font-body text-[#213D2E]">
      {/* NAV */}
      <nav className="fixed inset-x-0 top-0 z-50 flex items-center justify-between border-b border-white/10 bg-earth/95 px-6 py-5 backdrop-blur-md md:px-12">
        <Wordmark className="text-xl text-[#E8EDE6]" />
        <div className="flex items-center gap-3">
          <SignInButton mode="modal">
            <button
              onClick={() =>
                track(WEB_EVENTS.SIGNIN_CTA_CLICKED, { location: "nav" })
              }
              className="text-xs font-medium uppercase tracking-[0.08em] text-[#7A9A88] transition-colors hover:text-[#E8EDE6]"
            >
              Sign in
            </button>
          </SignInButton>
          <SignUpButton mode="modal">
            <button
              onClick={() =>
                track(WEB_EVENTS.SIGNUP_CTA_CLICKED, { location: "nav" })
              }
              className="rounded-full border border-gold/30 bg-gold/10 px-4 py-1.5 text-xs font-semibold tracking-wide text-gold-light transition-colors hover:bg-gold/20"
            >
              Get Started
            </button>
          </SignUpButton>
        </div>
      </nav>

      {/* HERO */}
      <section className="relative flex flex-1 flex-col items-center justify-center overflow-hidden bg-earth px-6 pb-12 pt-24 text-center md:px-12">
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage:
              "radial-gradient(circle at 1px 1px, rgba(139,175,154,0.06) 1px, transparent 0)",
            backgroundSize: "28px 28px",
          }}
        />
        <div className="relative">
          <span className="mb-5 inline-flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.14em] text-gold-light before:inline-block before:h-px before:w-4 before:bg-gold after:inline-block after:h-px after:w-4 after:bg-gold">
            Landscape &amp; Construction Estimating
          </span>
          <h1 className="font-display text-[clamp(3rem,5.5vw,5rem)] leading-[1.04] text-[#E8EDE6]">
            Bid faster.
            <br />
            <em className="not-italic text-gold-light">Bill right.</em>
          </h1>
          <p className="mx-auto mt-5 max-w-[52ch] text-base leading-relaxed text-[#7A9A88] md:text-lg">
            A complete estimating and project management platform built
            specifically for landscape and construction contractors —
            field-tested for 20 years, now in software.
          </p>

          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <PrimaryCTA>Get Started</PrimaryCTA>
            <SecondaryCTA>Sign in</SecondaryCTA>
          </div>
          <p className="mt-3 text-xs tracking-wide text-[#7A9A88]">
            Set up your business in minutes. Invite your crew anytime.
          </p>

          <div className="mx-auto mt-7 flex max-w-[520px] flex-wrap justify-center gap-1.5">
            {PHASES.slice(0, 8).map((phase) => (
              <span
                key={phase}
                className="rounded-full border border-gold/20 bg-gold/10 px-2.5 py-1 font-mono text-[0.62rem] font-medium uppercase tracking-[0.08em] text-gold-light"
              >
                {phase}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* TICKER */}
      <div className="overflow-hidden whitespace-nowrap bg-gold py-3">
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
      <footer className="flex flex-col items-center justify-between gap-3 border-t border-white/10 bg-earth px-6 py-8 text-center md:flex-row md:px-12 md:text-left">
        <Wordmark className="text-lg text-[#E8EDE6]" />
        <p className="text-sm text-[#7A9A88]">
          Built for landscape &amp; construction contractors.
        </p>
      </footer>
    </div>
  );
}
