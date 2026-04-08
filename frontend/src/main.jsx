import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { PredioProvider } from './contexts/PredioContext.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <PredioProvider>
      <App />
    </PredioProvider>
  </StrictMode>,
)