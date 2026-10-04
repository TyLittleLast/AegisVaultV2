import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Fonts are bundled rather than fetched from a CDN: a remote font request
// would disclose the user to a third party on every page load. Only the weight
// axis is imported, and each @font-face carries a unicode-range so the browser
// fetches just the latin subset.
import '@fontsource-variable/inter/wght.css'
import '@fontsource-variable/jetbrains-mono/wght.css'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)