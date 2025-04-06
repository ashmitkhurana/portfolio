import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Prevent automatic scrolling to hash on page load
if (window.location.hash) {
  // Store the hash
  const hash = window.location.hash;
  
  // Clear the hash without causing a page jump
  history.replaceState(null, document.title, window.location.pathname + window.location.search);
  
  // After the app is mounted, we can handle hash navigation manually if needed
  window.addEventListener('load', () => {
    // Wait a bit to ensure the app is fully rendered
    setTimeout(() => {
      // Only scroll if the element exists and user hasn't scrolled yet
      if (document.querySelector(hash) && window.scrollY === 0) {
        // We can choose to scroll or not here - by default, do nothing
        // This prevents automatic scrolling to sections on load
      }
    }, 500);
  });
}

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Failed to find the root element');
}

const root = createRoot(rootElement);

root.render(
  <StrictMode>
    <App />
  </StrictMode>
);
