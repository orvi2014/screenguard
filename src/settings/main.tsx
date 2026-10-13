import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../ui/theme.css';
import '../ui/page.css';
import { ErrorBoundary } from '../ui/ErrorBoundary';
import { SettingsPage } from './SettingsPage';

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(
    <StrictMode>
      <ErrorBoundary>
        <SettingsPage />
      </ErrorBoundary>
    </StrictMode>,
  );
}
