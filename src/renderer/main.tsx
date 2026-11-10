import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createWindowHost } from './app/host';
import { App } from './app/App';
import './app/app.css';

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');

void createWindowHost(window.chalkbond)
  .then((host) => {
    createRoot(root).render(
      <StrictMode>
        <App host={host} />
      </StrictMode>,
    );
  })
  .catch((error) => window.chalkbond.logError(String(error)));
