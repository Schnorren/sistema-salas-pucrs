import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
// Redesign 2026-11: fontes self-hosted + design system escopado em .sx
import '@fontsource/ibm-plex-sans/400.css'
import '@fontsource/ibm-plex-sans/500.css'
import '@fontsource/ibm-plex-sans/600.css'
import '@fontsource/ibm-plex-sans/700.css'
import '@fontsource/ibm-plex-mono/400.css'
import '@fontsource/ibm-plex-mono/500.css'
import '@fontsource/ibm-plex-mono/600.css'
import '@fontsource/eb-garamond/500.css'
import '@fontsource/eb-garamond/600.css'
import './styles/sx.css'
// Aplica o tema salvo (body.dark-mode) antes do primeiro render, inclusive no Login
import './hooks/useTema'
import App from './App.jsx'
import { PredioProvider } from './contexts/PredioContext.jsx'
import { UIProvider } from './contexts/UIContext.jsx'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter } from 'react-router-dom'
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      staleTime: 1000 * 60 * 5,
    },
  },
});

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <QueryClientProvider client={queryClient}>
        <PredioProvider>
          <UIProvider>
            <App />
          </UIProvider>
        </PredioProvider>
      </QueryClientProvider>
    </BrowserRouter>
  </StrictMode>,
)