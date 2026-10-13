import type { RiskLevel } from '../../shared/types';
import { Shield } from '../../ui/Shield';

const TONE: Record<RiskLevel, 'safe' | 'warn' | 'risk'> = {
  SAFE: 'safe',
  SENSITIVE: 'warn',
  RISKY: 'risk',
};

const WORD: Record<RiskLevel, string> = {
  SAFE: 'Safe',
  SENSITIVE: 'Sensitive',
  RISKY: 'Risky',
};

export function CurrentSite({ host, level, label }: { host: string; level: RiskLevel; label: string }) {
  const tone = TONE[level];
  return (
    <div className="card site-card">
      <Shield size={18} tone={tone} />
      <div style={{ minWidth: 0, flex: 1 }}>
        <div className="host">{host || 'This page'}</div>
        <div className="why" title={label}>{label}</div>
      </div>
      <span className={`pill ${tone}`}>{WORD[level]}</span>
    </div>
  );
}
