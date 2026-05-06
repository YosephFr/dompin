export function BrandLogo({ size = 14 }: { size?: number }): JSX.Element {
  return (
    <svg viewBox="0 0 16 16" width={size} height={size} aria-hidden="true" focusable="false">
      <path
        d="M8 1.4c-2.76 0-5 2.16-5 4.83 0 3.55 5 8.37 5 8.37s5-4.82 5-8.37c0-2.67-2.24-4.83-5-4.83z"
        fill="currentColor"
      />
      <circle cx="8" cy="6.2" r="1.9" fill="var(--bg)" />
    </svg>
  );
}
