import { ButtonLink } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="mx-auto w-full max-w-xl px-4 py-16">
      <h1 className="display text-5xl">This page isn&apos;t here.</h1>
      <p className="mt-4 text-ink-soft">The link may be old, or the car may have been sold and removed.</p>
      <ButtonLink href="/" className="mt-8">
        Go to the home page
      </ButtonLink>
    </div>
  );
}
