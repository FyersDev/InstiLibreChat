import 'regenerator-runtime/runtime';
import { createRoot } from 'react-dom/client';
import { FYERS_T2_API_BASE, fyersT2ApiList, fyersT2Urls } from './constants/api_list';
import './locales/i18n';
import App from './App';
import './style.css';
import './styles/tokens/figma-tokens.css';
import './styles/typography-fy.css';
import './mobile.css';
import { ApiErrorBoundaryProvider } from './hooks/ApiErrorBoundaryContext';
import 'katex/dist/katex.min.css';
import 'katex/dist/contrib/copy-tex.js';

/** FYERS api-t2 URLs — see client/src/constants/api_list.ts */
globalThis.__FYERS_T2_API__ = {
  base: FYERS_T2_API_BASE,
  urls: fyersT2Urls,
  list: fyersT2ApiList,
};

const container = document.getElementById('root');
const root = createRoot(container);

root.render(
  <ApiErrorBoundaryProvider>
    <App />
  </ApiErrorBoundaryProvider>,
);
