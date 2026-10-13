import { useEffect, useState } from 'react';
import type { CategoryKey, SensitiveMode } from '../shared/types';
import { addToList, removeFromList } from '../storage/storageService';
import { useSettings } from '../ui/useSettings';
import { Shield } from '../ui/Shield';
import { Chevron, Section, SettingRow, Switch } from '../ui/components';
import { ArrowLeftIcon, ChevronRightIcon } from '../ui/icons';
import { SUPPORT_EMAIL, bugReportLink, falsePositiveLink, missedSiteLink } from '../shared/contact';
import { DomainList } from './DomainList';
import { AccountSection } from './AccountSection';

type Panel = 'main' | 'allowlist' | 'blocklist';
type ReputationMetadata = { generatedAt: string; domains: number; sha256: string };

const CATEGORIES: Array<{ key: CategoryKey; title: string; description: string }> = [
  { key: 'adult', title: 'Adult content', description: 'Pornography and NSFW sites' },
  { key: 'gambling', title: 'Gambling', description: 'Casinos, betting and sportsbooks' },
  { key: 'phishing', title: 'Phishing', description: 'Addresses imitating a real brand' },
  { key: 'malware', title: 'Suspicious downloads', description: 'Programs and installers' },
  { key: 'suspicious', title: 'Suspicious websites', description: 'Raw IP addresses and odd domains' },
  { key: 'private', title: 'Personal pages', description: 'Email, banking and chat — while screen sharing' },
];

const SENSITIVE_MODES: Array<{ value: SensitiveMode; label: string }> = [
  { value: 'screenshare', label: 'While screen sharing' },
  { value: 'always', label: 'Always' },
  { value: 'off', label: 'Never' },
];

export function SettingsPage() {
  const { settings, update, loading } = useSettings();
  const [panel, setPanel] = useState<Panel>('main');
  const [geminiKeyDraft, setGeminiKeyDraft] = useState('');
  const [confirmClearKey, setConfirmClearKey] = useState(false);
  const [reputationMetadata, setReputationMetadata] = useState<ReputationMetadata | null>(null);

  useEffect(() => setGeminiKeyDraft(settings.geminiApiKey), [settings.geminiApiKey]);
  useEffect(() => {
    void fetch(chrome.runtime.getURL('reputation/metadata.json'))
      .then((response) => response.ok ? response.json() : null)
      .then((metadata: unknown) => {
        if (!metadata || typeof metadata !== 'object') return;
        const item = metadata as Partial<ReputationMetadata>;
        if (typeof item.generatedAt === 'string' && typeof item.domains === 'number' && typeof item.sha256 === 'string') {
          setReputationMetadata(item as ReputationMetadata);
        }
      })
      .catch(() => undefined);
  }, []);

  if (loading) return <div className="page" />;

  const setCategory = (key: CategoryKey, on: boolean) =>
    update({ categories: { ...settings.categories, [key]: on } });

  const applyPreset = (preset: 'balanced' | 'family' | 'presentation') => {
    if (preset === 'balanced') {
      void update({ ...settings, screenShareActive: false, sensitiveMode: 'screenshare' });
      return;
    }
    if (preset === 'family') {
      void update({ ...settings, sensitiveMode: 'always', categories: { ...settings.categories, adult: true, gambling: true, phishing: true, malware: true, suspicious: true } });
      return;
    }
    void update({ ...settings, screenShareProtection: true, screenShareActive: true, sensitiveMode: 'always', confirmBeforeReveal: true, categories: { ...settings.categories, private: true } });
  };

  if (panel !== 'main') {
    const isAllow = panel === 'allowlist';
    return (
      <div className="page fade-in">
        <header className="page-header">
          <button className="btn quiet" onClick={() => setPanel('main')} style={{ marginLeft: -10 }}>
            <ArrowLeftIcon size={15} />
            Settings
          </button>
        </header>
        <h1 style={{ marginBottom: 6 }}>{isAllow ? 'Allowed websites' : 'Blocked websites'}</h1>
        <p className="muted" style={{ marginBottom: 24 }}>
          {isAllow
            ? 'ScreenGuard never warns you about these sites. Subdomains are included.'
            : 'These sites are always stopped before they load, whatever the risk engine thinks.'}
        </p>
        <DomainList
          domains={isAllow ? settings.allowlist : settings.blocklist}
          placeholder="example.com"
          label={isAllow ? 'Website to always allow' : 'Website to always block'}
          emptyText={isAllow ? 'No allowed websites yet.' : 'No blocked websites yet.'}
          onAdd={(d) => void addToList(isAllow ? 'allowlist' : 'blocklist', d)}
          onRemove={(d) => void removeFromList(isAllow ? 'allowlist' : 'blocklist', d)}
          onMove={(d) => void addToList(isAllow ? 'blocklist' : 'allowlist', d)}
          moveLabel={isAllow ? 'Move to blocked list' : 'Move to allowed list'}
        />
      </div>
    );
  }

  return (
    <div className="page fade-in">
      <header className="page-header">
        <Shield size={24} tone="primary" filled />
        <div className="title">ScreenGuard</div>
        <div className="spacer" />
        <span className={`pill ${settings.protectionEnabled ? 'safe' : 'idle'}`}>
          {settings.protectionEnabled ? 'Protected' : 'Paused'}
        </span>
      </header>

      <h1 style={{ marginBottom: 28 }}>Settings</h1>

      <Section title="Quick setup" footer="Presets adjust local settings only. You can fine-tune every switch below.">
        <div className="setting-row" style={{ alignItems: 'flex-start' }}>
          <div>
            <div className="sr-title">Protection presets</div>
            <div className="sr-desc">Choose a starting point for everyday browsing, family browsing, or presenting.</div>
          </div>
          <div className="sr-control" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <button className="btn secondary" onClick={() => applyPreset('balanced')}>Everyday</button>
            <button className="btn secondary" onClick={() => applyPreset('family')}>Family</button>
            <button className="btn secondary" onClick={() => applyPreset('presentation')}>Start presenting</button>
          </div>
        </div>
      </Section>

      <Section title="General">
        <SettingRow title="Protection" description="The master switch for everything below.">
          <Switch
            checked={settings.protectionEnabled}
            onChange={(v) => update({ protectionEnabled: v })}
            label="Protection"
          />
        </SettingRow>
        <SettingRow title="Warn before risky sites" description="Show a warning on hover and before a click opens.">
          <Switch
            checked={settings.warnBeforeRisky}
            onChange={(v) => update({ warnBeforeRisky: v })}
            label="Warn before risky sites"
          />
        </SettingRow>
        <SettingRow title="Screen-share protection" description="Be stricter while you're presenting.">
          <Switch
            checked={settings.screenShareProtection}
            onChange={(v) => update({ screenShareProtection: v })}
            label="Screen-share protection"
          />
        </SettingRow>
        <SettingRow title="I'm sharing my screen right now" description="Turns the stricter rules on immediately.">
          <Switch
            checked={settings.screenShareActive}
            onChange={(v) => update({ screenShareActive: v })}
            label="Sharing my screen right now"
          />
        </SettingRow>
        <SettingRow title="Safe search" description="Keep Google and Bing in strict filtering mode for every search.">
          <Switch checked={settings.safeSearchEnabled} onChange={(v) => update({ safeSearchEnabled: v })} label="Safe search" />
        </SettingRow>
      </Section>

      <Section
        title="Sensitive content"
        footer="Detection runs entirely in your browser. Page text is never sent anywhere."
      >
        <SettingRow title="Hide sensitive information" description="Blur detected emails, keys, tokens and card numbers in page text and form fields.">
          <select
            className="input"
            style={{ flex: '0 0 auto', maxWidth: 200 }}
            value={settings.sensitiveMode}
            onChange={(e) => update({ sensitiveMode: e.target.value as SensitiveMode })}
          >
            {SENSITIVE_MODES.map((m) => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
        </SettingRow>
        <SettingRow title="Ask before revealing" description="Confirm before un-blurring, in case you're still sharing.">
          <Switch
            checked={settings.confirmBeforeReveal}
            onChange={(v) => update({ confirmBeforeReveal: v })}
            label="Ask before revealing"
          />
        </SettingRow>
      </Section>

      <Section title="Protection">
        {CATEGORIES.map((c) => (
          <SettingRow key={c.key} title={c.title} description={c.description}>
            <Switch
              checked={settings.categories[c.key]}
              onChange={(v) => setCategory(c.key, v)}
              label={c.title}
            />
          </SettingRow>
        ))}
        <SettingRow
          title="Blocked websites"
          description={`${settings.blocklist.length} site${settings.blocklist.length === 1 ? '' : 's'}`}
          onClick={() => setPanel('blocklist')}
        >
          <Chevron />
        </SettingRow>
        <SettingRow
          title="Allowed websites"
          description={`${settings.allowlist.length} site${settings.allowlist.length === 1 ? '' : 's'}`}
          onClick={() => setPanel('allowlist')}
        >
          <Chevron />
        </SettingRow>
      </Section>

      <Section title="Reputation data" footer="This dataset is bundled with the extension and checked locally. It is refreshed only when you install an updated release.">
        <SettingRow
          title="Offline category database"
          description={reputationMetadata
            ? `${reputationMetadata.domains.toLocaleString()} reviewed domains, generated ${new Date(reputationMetadata.generatedAt).toLocaleDateString()}.`
            : 'Loading local dataset details…'}
        >
          <span className="pill safe">Verified</span>
        </SettingRow>
        {reputationMetadata && (
          <div className="muted small mono" style={{ padding: '0 16px 14px', wordBreak: 'break-all' }}>
            SHA-256 {reputationMetadata.sha256}
          </div>
        )}
      </Section>

      <Section title="History">
        <SettingRow
          title="Protection history"
          description="Everything ScreenGuard blocked, warned about or allowed."
          onClick={() => { location.href = chrome.runtime.getURL('history.html'); }}
        >
          <Chevron />
        </SettingRow>
      </Section>

      <Section title="Privacy">
        <SettingRow title="Local processing" description="Risk checks and content detection run on this device.">
          <span className="pill safe">Enabled</span>
        </SettingRow>
        <div style={{ padding: '14px 16px' }} className="muted small">
          ScreenGuard does not send your browsing history to our servers. There is no
          analytics or tracking. Optional Gemini visual detection is the only feature
          that sends selected page thumbnails outside your browser.
        </div>
      </Section>

      <Section title="Gemini visual detection" footer="When enabled, up to three visible thumbnails from the current page are sent directly to Google Gemini for explicit-content classification. This is optional cloud processing, not local-only protection.">
        <SettingRow title="Check visible thumbnails" description={settings.geminiApiKey ? 'Adds visual detection for text-light adult galleries.' : 'Add a restricted Gemini API key below before enabling this optional feature.'}>
          <Switch checked={settings.geminiVisionEnabled} disabled={!settings.geminiApiKey} onChange={(v) => update({ geminiVisionEnabled: v })} label="Gemini visual detection" />
        </SettingRow>
        <div style={{ padding: '14px 16px' }}>
          <label className="small muted" htmlFor="gemini-key">Gemini API key (stored in this Chrome profile - use a key restricted to Gemini)</label>
          <input id="gemini-key" className="input" type="password" autoComplete="off" autoCapitalize="none" spellCheck={false} value={geminiKeyDraft}
            placeholder="AIza…" onChange={(e) => { setGeminiKeyDraft(e.target.value.trim()); setConfirmClearKey(false); }} onBlur={() => update({ geminiApiKey: geminiKeyDraft })} />
          <div className="row" style={{ justifyContent: 'space-between', marginTop: 10 }}>
            <span className="small muted">It is used only for direct requests to Google.</span>
            <button className="btn quiet" disabled={!settings.geminiApiKey} onClick={() => {
              if (!confirmClearKey) { setConfirmClearKey(true); return; }
              setGeminiKeyDraft(''); setConfirmClearKey(false); void update({ geminiApiKey: '', geminiVisionEnabled: false });
            }}>{confirmClearKey ? 'Confirm clear key' : 'Clear key'}</button>
          </div>
          <label className="small muted" htmlFor="gemini-model" style={{ display: 'block', marginTop: 10 }}>Gemini model</label>
          <input id="gemini-model" className="input" value={settings.geminiModel}
            onChange={(e) => update({ geminiModel: e.target.value.trim() || 'gemini-2.0-flash' })} />
        </div>
      </Section>

      <Section title="Network-wide protection" footer="Chrome cannot change your device DNS. Set a family-safe DNS provider on your router or operating system to cover other browsers and apps too.">
        <SettingRow title="Family-safe DNS" description="Adds a second layer outside ScreenGuard for devices on your network.">
          <span className="pill idle">Set outside Chrome</span>
        </SettingRow>
      </Section>

      <AccountSection />

      <Section
        title="Help"
        footer={`Messages open in your own mail client and go to ${SUPPORT_EMAIL}. Nothing is sent automatically, and your browsing history is never attached.`}
      >
        <a className="setting-row is-action" href={bugReportLink()}>
          <span className="sr-title">Report a problem</span>
          <span className="sr-control"><ChevronRightIcon size={16} /></span>
          <span className="sr-desc">Something is broken or behaving unexpectedly.</span>
        </a>
        <a className="setting-row is-action" href={falsePositiveLink('')}>
          <span className="sr-title">A safe site was flagged</span>
          <span className="sr-control"><ChevronRightIcon size={16} /></span>
          <span className="sr-desc">Tell us which one and it gets fixed in the next release.</span>
        </a>
        <a className="setting-row is-action" href={missedSiteLink()}>
          <span className="sr-title">A risky site got through</span>
          <span className="sr-control"><ChevronRightIcon size={16} /></span>
          <span className="sr-desc">Help make the checks better.</span>
        </a>
      </Section>

      <Section title="Try it">
        <SettingRow
          title="Open the demo page"
          description="A safe sandbox with example risky links."
          onClick={() => { location.href = chrome.runtime.getURL('demo.html'); }}
        >
          <Chevron />
        </SettingRow>
        <SettingRow
          title="Replay the welcome tour"
          onClick={() => { location.href = chrome.runtime.getURL('onboarding.html'); }}
        >
          <Chevron />
        </SettingRow>
      </Section>
    </div>
  );
}
