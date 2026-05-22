import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './App.css';
import { initAccentColor } from './lib/accent';

document.documentElement.classList.add('dark');
initAccentColor();

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
