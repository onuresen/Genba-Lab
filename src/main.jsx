import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { KitProvider } from './components/KitContext.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <KitProvider>
      <App />
    </KitProvider>
  </StrictMode>,
)
