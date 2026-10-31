import { createRoot } from 'react-dom/client'
import { App } from './App'
import { createBrowserApi } from './browserApi'
import './styles.css'
import './pages/pages.css'

// Outside Electron there's no preload, so run the simulator in the page instead.
if (!window.sds) window.sds = createBrowserApi()

createRoot(document.getElementById('root')!).render(<App />)
