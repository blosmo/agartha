import React from 'react';
import { createRoot } from 'react-dom/client';
import './layout.css';

if (import.meta.env.VITE_CLOUD_MODE !== 'true' && new URLSearchParams(window.location.search).get('workspace') === 'canvas') {
  void import('./App');
} else {
  void import('../worlds/WorldSpace').then(({ WorldSpace }) => {
    const element = document.getElementById('root');
    if (element) createRoot(element).render(<React.StrictMode><WorldSpace /></React.StrictMode>);
  });
}
