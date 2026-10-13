import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../ui/theme.css';
import './warning.css';
import { ErrorBoundary } from '../ui/ErrorBoundary';
import { WarningPage } from './WarningPage';

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(
    <StrictMode>
      <ErrorBoundary>
        <WarningPage />
      </ErrorBoundary>
    </StrictMode>,
  );
}
