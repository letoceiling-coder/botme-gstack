import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { WidgetApp } from './app';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <WidgetApp />
  </StrictMode>,
);
