import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { PredioProvider } from './contexts/PredioContext.jsx'
import { UIProvider } from './contexts/UIContext.jsx'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
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
    <QueryClientProvider client={queryClient}>
      <PredioProvider>
        <UIProvider>
          <App />
        </UIProvider>
      </PredioProvider>
    </QueryClientProvider>
  </StrictMode>,
)