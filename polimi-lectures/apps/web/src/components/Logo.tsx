export function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <rect width="32" height="32" rx="8" fill="#2f68b0" />
      <path d="M11 9h6.5a5 5 0 0 1 0 10H14v4h-3zM14 12v4h3.3a2 2 0 0 0 0-4z" fill="#fff" />
    </svg>
  );
}
