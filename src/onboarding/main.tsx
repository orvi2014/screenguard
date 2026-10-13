import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../ui/theme.css';
import './onboarding.css';
import { ErrorBoundary } from '../ui/ErrorBoundary';
import { Onboarding } from './Onboarding';

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(
    <StrictMode>
      <ErrorBoundary>
        <Onboarding />
      </ErrorBoundary>
    </StrictMode>,
  );
}
