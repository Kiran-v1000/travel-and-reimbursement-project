import { Component } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

/**
 * Keeps one broken page from blanking the whole app: the menu and header stay usable and the
 * person sees what happened, with a way to retry. Reset by changing `resetKey` (the URL).
 */
export class PageErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('[page] crashed', error, info?.componentStack);
  }

  componentDidUpdate(prev) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null });
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div role="alert" className="card mx-auto mt-10 max-w-lg p-8 text-center">
        <span className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-bad/10 text-bad">
          <AlertTriangle className="h-6 w-6" aria-hidden />
        </span>
        <h1 className="text-[18px] font-semibold">This page ran into a problem</h1>
        <p className="mt-1.5 text-[13.5px] text-muted">The rest of Voyage still works. Try again, or use the menu to go somewhere else. If it keeps happening, tell your administrator.</p>
        <button type="button" className="btn-primary mt-5" onClick={() => this.setState({ error: null })}>
          <RotateCcw className="h-4 w-4" aria-hidden /> Try again
        </button>
      </div>
    );
  }
}
