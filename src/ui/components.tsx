import type { ReactNode } from 'react';

export function Switch({
  checked, onChange, label, small, disabled,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  small?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      className={small ? 'switch sm' : 'switch'}
      data-on={checked}
      onClick={() => onChange(!checked)}
    />
  );
}

/**
 * A row in a settings list. When it navigates somewhere it becomes a real
 * button — focusable, activated by Enter *and* Space, and announced as a
 * button rather than as a div that happens to respond to clicks.
 */
export function SettingRow({
  title, description, children, onClick,
}: {
  title: string;
  description?: string;
  children?: ReactNode;
  onClick?: () => void;
}) {
  // Title, control and description are siblings rather than nested, so one
  // grid can keep the control on the right while the description reflows
  // underneath at any width.
  const body = (
    <>
      <span className="sr-title">{title}</span>
      {children ? <span className="sr-control">{children}</span> : <span />}
      {description && <span className="sr-desc">{description}</span>}
    </>
  );

  if (!onClick) return <div className="setting-row">{body}</div>;

  return (
    <button type="button" className="setting-row is-action" onClick={onClick}>
      {body}
    </button>
  );
}

export function Section({ title, children, footer }: { title: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <section style={{ marginBottom: 28 }}>
      <h3 style={{ marginBottom: 10 }}>{title}</h3>
      <div className="card">{children}</div>
      {footer && <div className="muted small" style={{ marginTop: 10, paddingInline: 2 }}>{footer}</div>}
    </section>
  );
}

export { ChevronRightIcon as Chevron } from './icons';
