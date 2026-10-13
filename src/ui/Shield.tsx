interface Props {
  size?: number;
  tone?: 'primary' | 'safe' | 'warn' | 'risk' | 'idle';
  filled?: boolean;
}

const TONE: Record<string, string> = {
  primary: 'var(--sg-primary)',
  safe: 'var(--sg-safe)',
  warn: 'var(--sg-warn)',
  risk: 'var(--sg-risk)',
  idle: 'var(--sg-muted)',
};

/** The ScreenGuard mark. One shield, used everywhere. */
export function Shield({ size = 20, tone = 'primary', filled = false }: Props) {
  const color = TONE[tone] ?? TONE.primary;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ display: 'block', flex: `0 0 ${size}px` }}>
      <path
        d="M12 2.5 4.5 5.5v6.2c0 4.6 3.1 8.5 7.5 9.8 4.4-1.3 7.5-5.2 7.5-9.8V5.5L12 2.5Z"
        fill={color}
        opacity={filled ? 1 : 0.14}
      />
      <path
        d="M12 2.5 4.5 5.5v6.2c0 4.6 3.1 8.5 7.5 9.8 4.4-1.3 7.5-5.2 7.5-9.8V5.5L12 2.5Z"
        stroke={filled ? 'none' : color}
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path
        d="m8.8 11.9 2.2 2.2 4.2-4.4"
        stroke={filled ? '#fff' : color}
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** The gradient app mark used on onboarding and the warning page. */
export function ShieldMark({ size = 56 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id="sg-mark" x1="3" y1="2" x2="21" y2="22" gradientUnits="userSpaceOnUse">
          <stop stopColor="#5C6AFF" />
          <stop offset="1" stopColor="#8B5CF6" />
        </linearGradient>
      </defs>
      <path
        d="M12 2.2 4.2 5.3v6.4c0 4.8 3.2 8.9 7.8 10.2 4.6-1.3 7.8-5.4 7.8-10.2V5.3L12 2.2Z"
        fill="url(#sg-mark)"
      />
      <path
        d="m8.6 12 2.4 2.4 4.4-4.7"
        stroke="#fff"
        strokeWidth="2.1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
