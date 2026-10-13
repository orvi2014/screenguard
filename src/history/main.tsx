import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../ui/theme.css';
import '../ui/page.css';
import { ErrorBoundary } from '../ui/ErrorBoundary';
import { HistoryPage } from './HistoryPage';

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(
    <StrictMode>
      <ErrorBoundary>
        <HistoryPage />
      </ErrorBoundary>
    </StrictMode>,
  );
}
