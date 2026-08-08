interface LeafMarkProps {
  size?: number;
  color?: string;
}

/** Brand artwork colors are intentionally independent from the application theme. */
export default function LeafMark({ size = 22, color = "#f4f7f5" }: LeafMarkProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M19.8 3.3C14.1 4 8.1 6.8 6.7 11.6c-1.1 3.8 1.4 7.3 5.2 7.3 5.6 0 9-5.5 7.9-15.6Z" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4 21c2.4-5.4 6.8-8.8 12.3-11.2" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
