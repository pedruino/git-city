// Static SSR shell rendered instantly while the client bundle for page.tsx
// hydrates. Next 16 treats this as the route-level Suspense fallback.
// Matches the home's "pre-city-loaded" state — dark bg, title, hint — so the
// handoff to the real canvas is seamless.

export default function Loading() {
  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center bg-bg text-cream">
      <h1 className="text-3xl font-bold tracking-wide sm:text-5xl">
        Git <span className="text-accent">City</span>
      </h1>
      <p className="mt-4 text-xs text-muted normal-case">
        Loading the city…
      </p>
      <div className="mt-8 flex gap-1.5">
        <span className="h-1.5 w-1.5 animate-[pulse_1.2s_ease-in-out_infinite] bg-cream/60" />
        <span
          className="h-1.5 w-1.5 animate-[pulse_1.2s_ease-in-out_infinite] bg-cream/60"
          style={{ animationDelay: "0.15s" }}
        />
        <span
          className="h-1.5 w-1.5 animate-[pulse_1.2s_ease-in-out_infinite] bg-cream/60"
          style={{ animationDelay: "0.3s" }}
        />
      </div>
    </div>
  );
}
