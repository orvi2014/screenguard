import { useEffect, useRef, useState } from 'react';
import type { Message, PopupState } from '../shared/types';
import { CATEGORY_LABELS } from '../shared/constants';
import { isScreenShareOn } from '../risk/policy';
import { useSettings } from '../ui/useSettings';
import { Shield } from '../ui/Shield';
import { BeakerIcon, ChevronRightIcon, ClockIcon, GearIcon } from '../ui/icons';
import { ProtectionPanel } from './components/ProtectionPanel';
import { CurrentSite } from './components/CurrentSite';

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

export function App() {
  const { settings, update } = useSettings();
  const [state, setState] = useState<PopupState | null>(null);
  const [feedback, setFeedback] = useState<'allow' | 'block' | null>(null);
  const stateRequest = useRef(0);

  useEffect(() => {
    let alive = true;
    const request = ++stateRequest.current;
    void send({ type: 'GET_POPUP_STATE' }).then((res) => {
      if (alive && request === stateRequest.current && res && typeof res === 'object' && 'settings' in res) {
        setState(res as PopupState);
      }
    });
    return () => { alive = false; };
  }, [settings]);

  const sharing = isScreenShareOn(settings);
  const on = settings.protectionEnabled;
  const verdict = state?.activeTabVerdict ?? null;

  const open = (page: 'settings' | 'history' | 'demo') => {
    void send({ type: 'OPEN_PAGE', page });
    window.close();
  };

  const giveFeedback = (decision: 'allow' | 'block') => {
    if (!verdict || feedback) return;
    setFeedback(decision);
    void send({ type: 'SITE_FEEDBACK', url: verdict.url, decision });
  };

  return (
    <div className="popup">
      <header className="popup-header">
        <Shield size={22} tone={on ? 'primary' : 'idle'} filled={on} />
        <div className="brand">ScreenGuard</div>
        <div className="spacer" />
        <span className={`pill ${!on ? 'idle' : sharing ? 'safe' : 'safe'}`}>
          {!on ? 'Paused' : sharing ? 'Sharing' : 'Protected'}
        </span>
      </header>

      <div className="popup-body">
        <ProtectionPanel
          settings={settings}
          today={state?.today ?? null}
          onToggleProtection={(next) => update({ protectionEnabled: next })}
          onToggleSharing={(next) => update({ screenShareActive: next })}
        />

        {verdict && (
          <>
            <CurrentSite
              host={verdict.domain}
              level={verdict.level}
              label={
                verdict.enforcement === 'allow'
                  ? 'No risk signals on this page'
                  : `${CATEGORY_LABELS[verdict.category] ?? 'Flagged'} — ${verdict.reason}`
              }
            />
            <div className="row" style={{ marginTop: 8 }}>
              <button className="btn secondary" style={{ flex: 1 }} disabled={feedback !== null}
                onClick={() => giveFeedback('allow')}>
                {feedback === 'allow' ? 'Marked safe' : 'This site is safe'}
              </button>
              <button className="btn secondary" style={{ flex: 1 }} disabled={feedback !== null}
                onClick={() => giveFeedback('block')}>
                {feedback === 'block' ? 'Blocked' : 'Block adult site'}
              </button>
            </div>
          </>
        )}
      </div>

      <footer className="popup-footer">
        <button className="foot-btn" onClick={() => open('demo')}>
          <span className="glyph"><BeakerIcon size={17} /></span>
          Try the demo page
          <span className="spacer" />
          <span className="chev"><ChevronRightIcon size={15} /></span>
        </button>
        <button className="foot-btn" onClick={() => open('history')}>
          <span className="glyph"><ClockIcon size={17} /></span>
          Protection history
          <span className="spacer" />
          <span className="chev"><ChevronRightIcon size={15} /></span>
        </button>
        <button className="foot-btn" onClick={() => open('settings')}>
          <span className="glyph"><GearIcon size={17} /></span>
          Settings
          <span className="spacer" />
          <span className="chev"><ChevronRightIcon size={15} /></span>
        </button>
      </footer>
    </div>
  );
}
