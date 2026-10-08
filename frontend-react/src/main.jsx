import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/global.css';
import App from './App.jsx';
import { registerServiceWorker, unregisterServiceWorker } from './services/serviceWorkerService';
import { initSyncEngine } from './services/syncService';
import { initViewportFix } from './services/viewportFix';
import './services/installPromptService';

if (import.meta.env.PROD) {
  registerServiceWorker();
} else {
  unregisterServiceWorker();
}
initSyncEngine();
initViewportFix();

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>
);
