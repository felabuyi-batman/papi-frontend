import React from 'react'
import { createRoot } from 'react-dom/client'
// Self-hosted so the rounded display face is guaranteed rather than falling back
// to whatever rounded font the operating system happens to have.
import '@fontsource-variable/fredoka'
import '@fontsource-variable/nunito'
import '@fontsource/instrument-serif'
import '@fontsource/jetbrains-mono'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <React.StrictMode><App /></React.StrictMode>
)
