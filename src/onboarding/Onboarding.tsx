import { useState } from 'react';
import { useSettings } from '../ui/useSettings';
import { ShieldMark, Shield } from '../ui/Shield';

interface Step {
  title: string;
  body: string;
  cta: string;
  points?: Array<{ title: string; text: string }>;
}

const STEPS: Step[] = [
  {
    title: 'Meet ScreenGuard',
    body: 'Never accidentally share what you shouldn’t.',
    cta: 'Get protected',
  },
  {
    title: 'Protect before you click',
    body: 'ScreenGuard checks where a link goes before it opens — and warns you while your cursor is still hovering.',
    cta: 'Continue',
    points: [
      { title: 'Links', text: 'Checked as they appear on the page.' },
      { title: 'Typed addresses and bookmarks', text: 'Stopped before the page loads.' },
      { title: 'Everything stays local', text: 'No URLs are sent anywhere.' },
    ],
  },
  {
    title: 'Stay safe while sharing',
    body: 'Flip one switch before a call and ScreenGuard gets stricter: personal pages are blocked and matching emails, keys and card numbers in page text and form fields are blurred.',
    cta: 'Enable protection',
  },
  {
    title: 'You’re protected',
    body: 'ScreenGuard stays out of your way. You’ll only hear from it when something looks risky.',
    cta: 'Start browsing',
  },
];

export function Onboarding() {
  const { settings, update } = useSettings();
  const [index, setIndex] = useState(0);
  const step = STEPS[index];
  const last = index === STEPS.length - 1;

  const next = async () => {
    if (index === 2) {
      await update({ protectionEnabled: true, screenShareProtection: true });
    }
    if (last) {
      await update({ onboardingComplete: true });
      window.close();
      // If the tab can't close itself (it wasn't opened by script), show the demo instead.
      window.location.href = chrome.runtime.getURL('demo.html');
      return;
    }
    setIndex((i) => i + 1);
  };

  const skip = async () => {
    await update({ onboardingComplete: true });
    window.location.href = chrome.runtime.getURL('demo.html');
  };

  return (
    <div className="ob-wrap">
      <div className="card ob-card fade-in" key={index}>
        <div className="mark">
          {last ? <Shield size={52} tone="safe" filled /> : <ShieldMark size={52} />}
        </div>

        <h1>{step.title}</h1>
        <p>{step.body}</p>

        {step.points && (
          <div className="ob-points">
            {step.points.map((p) => (
              <div className="ob-point" key={p.title}>
                <Shield size={17} tone="primary" />
                <div className="txt">
                  <strong>{p.title}</strong>
                  {p.text}
                </div>
              </div>
            ))}
          </div>
        )}

        {last && (
          <div className="row" style={{ justifyContent: 'center', marginBottom: 26 }}>
            <span className="pill safe"><span className="dot safe" /> Protection on</span>
          </div>
        )}

        <button className="btn primary lg block" onClick={next}>{step.cta}</button>

        <div className="ob-dots">
          {STEPS.map((s, i) => (
            <span key={s.title} className={`ob-dot${i === index ? ' on' : ''}`} />
          ))}
        </div>
      </div>

      {!last && (
        <button className="btn quiet ob-skip" onClick={skip}>Skip the tour</button>
      )}

      {settings.onboardingComplete && index === 0 && (
        <div className="muted small" style={{ marginTop: 14 }}>
          You’ve seen this before — replaying it won’t change your settings.
        </div>
      )}
    </div>
  );
}
