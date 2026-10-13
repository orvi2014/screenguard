import type { DayStats, Settings } from '../../shared/types';
import { isScreenShareOn } from '../../risk/policy';
import { Switch } from '../../ui/components';
import {
  ActivityIcon, CheckIcon, CompassIcon, EyeOffIcon, LinkIcon, MonitorIcon,
} from '../../ui/icons';

interface Props {
  settings: Settings;
  today: DayStats | null;
  onToggleProtection: (next: boolean) => void;
  onToggleSharing: (next: boolean) => void;
}

export function ProtectionPanel({ settings, today, onToggleProtection, onToggleSharing }: Props) {
  const on = settings.protectionEnabled;
  const sharing = isScreenShareOn(settings);
  const categoriesOn = Object.values(settings.categories).some(Boolean);
  // The Personal pages category is the master switch for local exposure
  // masking as well as private-page checks. Keep the summary aligned with the
  // content detector so it never reports protection that is disabled.
  const sensitiveOn = settings.categories.private && settings.sensitiveMode !== 'off' &&
    (settings.sensitiveMode === 'always' || sharing);

  const modes = [
    {
      key: 'link',
      icon: <LinkIcon size={17} />,
      name: 'Link protection',
      desc: 'Checks links before you click',
      active: on && (settings.warnBeforeRisky || categoriesOn || settings.blocklist.length > 0),
    },
    {
      key: 'navigation',
      icon: <CompassIcon size={17} />,
      name: 'Navigation protection',
      desc: 'Blocks risky pages as they open',
      active: on && (categoriesOn || settings.blocklist.length > 0),
    },
    {
      key: 'sensitive',
      icon: <EyeOffIcon size={17} />,
      name: 'Sensitive content',
      desc: settings.sensitiveMode === 'always' ? 'Hides private info on every page' : 'Hides private info while sharing',
      active: on && sensitiveOn,
    },
  ];

  return (
    <div className="card panel">
      <div className="panel-head">
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="title">{on ? 'Protection is on' : 'Protection is off'}</div>
          <div className="sub">
            {on
              ? 'Checking links, pages and content.'
              : 'Nothing is being checked on this device.'}
          </div>
        </div>
        <Switch checked={on} onChange={onToggleProtection} label="Protection" />
      </div>

      <div className="mode-list">
        {modes.map((mode) => (
          <div key={mode.key} className={mode.active ? 'mode' : 'mode is-muted'}>
            <span className="glyph">{mode.icon}</span>
            <span className="text">
              <span className="name">{mode.name}</span>
              <span className="desc" style={{ display: 'block' }}>{mode.desc}</span>
            </span>
            <span className="state">
              {mode.active
                ? <span className="on" title="Active"><CheckIcon size={16} /></span>
                : <span className="off">Off</span>}
            </span>
          </div>
        ))}

        {/* Screen sharing is the one mode you switch from here, because you
            switch it on for the next ten minutes rather than for good. */}
        <div className={sharing ? 'mode is-active' : on ? 'mode' : 'mode is-muted'}>
          <span className="glyph"><MonitorIcon size={17} /></span>
          <span className="text">
            <span className="name">Screen share protection</span>
            <span className="desc" style={{ display: 'block' }}>
              {sharing
                ? 'Active — blocking private pages'
                : settings.screenShareProtection
                  ? 'Turn on while you present'
                  : 'Disabled in settings'}
            </span>
          </span>
          <span className="state">
            <Switch
              checked={sharing}
              onChange={onToggleSharing}
              label="Screen share protection"
              disabled={!on || !settings.screenShareProtection || !settings.categories.private}
              small
            />
          </span>
        </div>
      </div>

      <div className="stats-row">
        <span className="glyph"><ActivityIcon size={17} /></span>
        <span style={{ minWidth: 0, flex: 1 }}>
          <span className="label" style={{ display: 'block' }}>Protected today</span>
          <span className="figures">
            {today
              ? `${today.blocked} risky ${today.blocked === 1 ? 'page' : 'pages'} blocked · ${today.linksChecked} links checked`
              : ' '}
          </span>
        </span>
      </div>
    </div>
  );
}
