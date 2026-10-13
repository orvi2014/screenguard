import { useState } from 'react';
import { normaliseDomainInput } from '../shared/utils';

export function DomainList({
  domains, placeholder, emptyText, label, onAdd, onRemove, onMove, moveLabel,
}: {
  domains: string[];
  placeholder: string;
  emptyText: string;
  label: string;
  onAdd: (domain: string) => void;
  onRemove: (domain: string) => void;
  onMove?: (domain: string) => void;
  moveLabel?: string;
}) {
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    const domain = normaliseDomainInput(value);
    if (!domain) {
      setError('Enter a website address, for example example.com');
      return;
    }
    if (domains.includes(domain)) {
      setError(`${domain} is already on this list`);
      return;
    }
    setError(null);
    setValue('');
    onAdd(domain);
  };

  return (
    <>
      <div className="card">
        {domains.length === 0 && <div className="list-empty">{emptyText}</div>}
        {domains.map((domain) => (
          <div className="tag-row" key={domain}>
            <span className="mono" style={{ flex: 1, wordBreak: 'break-all' }}>{domain}</span>
            <button
              className="link-btn"
              onClick={() => onRemove(domain)}
              aria-label={`Remove ${domain}`}
            >
              Remove
            </button>
            {onMove && moveLabel && (
              <button
                className="link-btn"
                onClick={() => onMove(domain)}
                aria-label={`${moveLabel} ${domain}`}
              >
                {moveLabel}
              </button>
            )}
          </div>
        ))}
      </div>

      <div className="row" style={{ marginTop: 12 }}>
        <input
          className="input"
          aria-label={label}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? 'domain-error' : undefined}
          value={value}
          placeholder={placeholder}
          onChange={(e) => {
            setValue(e.target.value);
            setError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit();
          }}
        />
        <button className="btn secondary" onClick={submit}>Add</button>
      </div>
      {error && (
        <div id="domain-error" role="alert" className="small"
          style={{ color: 'var(--sg-risk)', marginTop: 8 }}>
          {error}
        </div>
      )}
    </>
  );
}
