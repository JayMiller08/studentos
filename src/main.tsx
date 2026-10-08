import '@fontsource-variable/inter'
// Headings only. Inter carrying both roles is what made every page read as a
// generic dashboard; Space Grotesk gives the titles a voice without touching
// the density or legibility of the UI text underneath.
import '@fontsource-variable/space-grotesk'
import '@/styles/globals.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from '@/app/App'

const container = document.getElementById('root')
if (!container) throw new Error('Root container missing in index.html')

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
