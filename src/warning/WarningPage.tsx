import { useMemo, useState } from 'react';
import type { Message, RiskCategory } from '../shared/types';
import { CATEGORY_LABELS } from '../shared/constants';
import { getDomain, isWebUrl, prettyUrl } from '../shared/utils';
import { Shield, ShieldMark } from '../ui/Shield';
import { falsePositiveLink } from '../shared/contact';

/**
 * `u` is always the final parameter and carries the original URL verbatim, so
 * everything after it is the address — no double-encoding games, and URLs
 * containing "&" or "#" survive intact.
 */
function parseParams() {
  // The hash is included because a declarativeNetRequest substitution passes the
  // URL through unencoded, which would otherwise strip its fragment.
  const raw = window.location.search + window.location.hash;
  const marker = raw.indexOf('&u=') >= 0 ? raw.indexOf('&u=') : raw.indexOf('?u=');
  const encoded = marker >= 0 ? raw.slice(marker + 3) : '';

  const params = new URLSearchParams(marker >= 0 ? raw.slice(0, marker) : raw);
  const networkRedirect = params.get('s') === 'known' || params.get('s') === 'list';
  let url = encoded;
  if (!networkRedirect) {
    try { url = decodeURIComponent(encoded); } catch { /* retain malformed input */ }
  }
  // DNR substitutions are already raw URLs: decoding them would turn an encoded
  // ampersand or slash into a different query parameter or path segment.
  return {
    url,
    category: (params.get('c') ?? 'UNKNOWN') as RiskCategory | 'BLOCKLIST',
    reason: params.get('r') ?? '',
    source: params.get('s') ?? '',
    inFrame: params.get('f') === '1' || isEmbedded(),
  };
}

/** True when this page was loaded into an iframe rather than a whole tab. */
function isEmbedded(): boolean {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}

function send(message: Message): Promise<unknown> {
  return new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage(message, (res) => {
        void chrome.runtime.lastError;
        resolve(res);
      });
    } catch {
      resolve(undefined);
    }
  });
}

export function WarningPage() {
  const { url, category, reason, source, inFrame } = useMemo(parseParams, []);
  const [step, setStep] = useState<'main' | 'choices'>('main');
  const [busy, setBusy] = useState(false);

  const valid = isWebUrl(url);
  const domain = valid ? getDomain(url) : '';
  const label =
    category === 'BLOCKLIST'
      ? 'On your blocked list'
      : CATEGORY_LABELS[category] ?? 'Flagged website';

  const description =
    reason ||
    (category === 'BLOCKLIST'
      ? 'You added this website to your own blocked list.'
      : source === 'screenshare'
        ? "You're sharing your screen, so ScreenGuard is being extra careful."
        : 'This website matched one of ScreenGuard’s risk checks.');

  const goBack = () => {
    if (window.history.length > 1) window.history.back();
    else window.close();
  };

  const proceed = async (scope: 'once' | 'always') => {
    if (!valid) return;
    setBusy(true);
    await send({ type: 'BYPASS_AND_NAVIGATE', url, scope });
    // The background worker navigates this tab; keep the button disabled meanwhile.
  };

  /**
   * Inside an iframe, "continue" must navigate only this frame. Asking the
   * background worker to update the tab would throw away the page the user
   * actually wanted to be on.
   */
  const showInFrame = async () => {
    if (!valid) return;
    setBusy(true);
    const result = await send({ type: 'ALLOW_DOMAIN', domain, scope: 'once' }) as { ok?: boolean };
    if (result?.ok) window.location.replace(url);
    else setBusy(false);
  };

  if (inFrame) {
    return (
      <div className="frame-block fade-in">
        <div className="frame-card">
          <Shield size={18} tone="risk" />
          <div className="frame-text">
            <div className="frame-title">
              {valid ? 'Embedded content blocked' : 'Content blocked'}
            </div>
            <div className="frame-meta">
              {label}{domain ? ` · ${domain}` : ''}
            </div>
          </div>
          {valid && (
            <button className="btn secondary frame-btn" onClick={showInFrame} disabled={busy}>
              Show anyway
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="warn-wrap">
      <div className="card warn-card fade-in">
        <div className="mark"><ShieldMark size={52} /></div>

        <>
            <h1>{valid ? 'This page was blocked for your protection' : 'That address couldn’t be opened'}</h1>
            <p className="lead">
              {valid
                ? 'ScreenGuard interrupted this navigation. You can still open it if you meant to.'
                : 'ScreenGuard couldn’t read the address it was asked to open.'}
            </p>

            {valid && (
              <div className="warn-target">
                <div className="key">ScreenGuard detected</div>
                <div className="host">{label}</div>
                <div className="reason">{description}</div>
                <div className="key" style={{ marginTop: 14 }}>Website</div>
                <div className="host">{prettyUrl(url, 90)}</div>
              </div>
            )}

            {step === 'main' ? (
              <div className="warn-actions">
                <button className="btn primary lg" onClick={goBack}>Go back to safety</button>
                {valid && (
                  <button className="btn secondary" onClick={() => setStep('choices')}>
                    Continue anyway
                  </button>
                )}
                {valid && (
                  <a
                    className="btn quiet"
                    href={falsePositiveLink(domain, { url, category: label, reason: description })}
                  >
                    Report a mistake
                  </a>
                )}
              </div>
            ) : (
              <div className="choices fade-in">
                <div className="title">How long should this be allowed?</div>
                <button className="btn secondary" onClick={() => proceed('once')} disabled={busy}>
                  Open once
                </button>
                <button className="btn secondary" onClick={() => proceed('always')} disabled={busy}>
                  Always allow {domain}
                </button>
                <button className="btn quiet" onClick={() => setStep('main')} disabled={busy}>
                  Cancel
                </button>
              </div>
            )}
        </>

        <div className="warn-note">
          You can always change this decision in{' '}
          <a href={chrome.runtime.getURL('settings.html')}>Settings</a>.
        </div>
      </div>
    </div>
  );
}
