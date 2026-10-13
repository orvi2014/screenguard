import { Component, type ErrorInfo, type ReactNode } from 'react';
import { ShieldMark } from './Shield';

/**
 * A blank extension page is the worst possible failure mode for a security
 * product, so every surface is wrapped in this.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ScreenGuard] UI error', error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div style={{ padding: 32, textAlign: 'center', maxWidth: 380, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
          <ShieldMark size={40} />
        </div>
        <h2 style={{ marginBottom: 8 }}>Something went wrong</h2>
        <p className="muted small" style={{ marginBottom: 20 }}>
          Your protection settings are safe. Reopening this page usually fixes it.
        </p>
        <button className="btn secondary" onClick={() => location.reload()}>Reload</button>
      </div>
    );
  }
}
