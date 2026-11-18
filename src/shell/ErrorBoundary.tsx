import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';

/**
 * Catches a page that fails to render so the rest of SWDR keeps working. Projects are saved to the
 * device as they change, so reloading never loses work.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error?: Error }> {
  state: { error?: Error } = {};

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('SWDR page error', error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return <main className="crash" role="alert">
      <h1>This page hit a problem</h1>
      <p>Your projects are saved on this device, so nothing has been lost. Reload to carry on, or go back to your projects.</p>
      <p className="crash-detail">{this.state.error.message}</p>
      <div className="crash-actions">
        <button type="button" className="primary" onClick={() => window.location.reload()}>Reload</button>
        <button type="button" onClick={() => { window.location.hash = '#home'; window.location.reload(); }}>Go to projects</button>
      </div>
    </main>;
  }
}
