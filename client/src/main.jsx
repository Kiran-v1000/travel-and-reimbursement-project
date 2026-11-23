import React from 'react';
import ReactDOM from 'react-dom/client';
import '@fontsource-variable/inter';
import './assets/styles.css';
import { Providers } from './app/providers.jsx';
import { AppRouter } from './app/router.jsx';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Providers>
      <AppRouter />
    </Providers>
  </React.StrictMode>,
);
