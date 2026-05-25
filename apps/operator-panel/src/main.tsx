import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { OperatorApp } from './app';
import { OperatorAuthGate } from './auth-gate';
import './operator.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <OperatorAuthGate>
      {(session) => <OperatorApp key={session.workspace.id} session={session} />}
    </OperatorAuthGate>
  </StrictMode>,
);
