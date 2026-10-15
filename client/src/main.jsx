import { Component, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import './index.css';

class RootBoundary extends Component {
  state = { error: null };
  static getDerivedStateFromError(error) { return { error }; }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="min-h-dvh grid place-items-center p-6 text-center">
        <div><h1 className="text-xl font-semibold">Something went wrong</h1><p className="text-mute mt-2 max-w-sm">An unexpected error occurred. Reload the page; your data is safe.</p>
          <button className="btn btn-primary mt-5" onClick={() => window.location.reload()}>Reload</button></div>
      </div>
    );
  }
}

createRoot(document.getElementById('root')).render(
  <StrictMode><RootBoundary><BrowserRouter><App /></BrowserRouter></RootBoundary></StrictMode>,
);
