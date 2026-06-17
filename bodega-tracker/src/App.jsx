import { useState } from 'react'
import { useProducts } from './hooks/useProducts.js'
import { useInventory } from './hooks/useInventory.js'
import TabRegistro from './components/TabRegistro.jsx'
import TabDashboard from './components/TabDashboard.jsx'
import TabHistorial from './components/TabHistorial.jsx'
import TabExportar from './components/TabExportar.jsx'
import Toast from './components/Toast.jsx'

const TABS = [
  { id: 'registro',  label: 'Registro',   icon: (active) => (
    <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5" stroke="currentColor" strokeWidth={active ? 2.5 : 2}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v4m0 4h.01" strokeLinecap="round" />
    </svg>
  )},
  { id: 'dashboard', label: 'Dashboard',  icon: (active) => (
    <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5" stroke="currentColor" strokeWidth={active ? 2.5 : 2}>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  )},
  { id: 'historial', label: 'Historial',  icon: (active) => (
    <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5" stroke="currentColor" strokeWidth={active ? 2.5 : 2}>
      <path d="M12 8v4l3 3" strokeLinecap="round" />
      <circle cx="12" cy="12" r="9" />
    </svg>
  )},
  { id: 'exportar',  label: 'Exportar',   icon: (active) => (
    <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5" stroke="currentColor" strokeWidth={active ? 2.5 : 2}>
      <path d="M12 3v13M7 11l5 5 5-5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5 20h14" strokeLinecap="round" />
    </svg>
  )},
]

export default function App() {
  const [activeTab, setActiveTab] = useState('registro')
  const [toast, setToast] = useState(null)
  const { products, productMap, addProducts } = useProducts()
  const inventory = useInventory(products, productMap)

  const onToast = (message, type = 'success') => {
    setToast({ message, type, key: Date.now() })
  }

  const TAB_CONTENT = {
    registro:  <TabRegistro  {...inventory} products={products} productMap={productMap} onToast={onToast} />,
    dashboard: <TabDashboard {...inventory} products={products} productMap={productMap} onToast={onToast} />,
    historial: <TabHistorial {...inventory} productMap={productMap} onToast={onToast} />,
    exportar:  <TabExportar  {...inventory} products={products} addProducts={addProducts} onToast={onToast} />,
  }

  return (
    <div className="min-h-screen bg-bg flex flex-col max-w-md mx-auto">
      <header className="sticky top-0 z-10 bg-bg/90 backdrop-blur-md border-b border-border px-4 py-3">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-text-primary font-ui font-bold text-lg leading-tight tracking-tight">
              Bodega Tracker
            </h1>
            <p className="text-text-muted text-xs font-ui mt-0.5">
              Coosalud Inversa S.A.
            </p>
          </div>
          <div className="w-9 h-9 rounded-xl bg-accent-green/10 border border-accent-green/20
            flex items-center justify-center">
            <span className="text-accent-green font-mono font-bold text-base">B</span>
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto px-4 pt-4">
        {TAB_CONTENT[activeTab]}
      </main>

      <nav className="sticky bottom-0 z-10 bg-bg/95 backdrop-blur-md border-t border-border px-2 pb-safe pt-1">
        <div className="flex">
          {TABS.map(tab => {
            const active = activeTab === tab.id
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex-1 flex flex-col items-center gap-1 py-2 rounded-xl transition-colors
                  ${active ? 'text-accent-green' : 'text-text-muted active:text-text-primary'}`}
              >
                {tab.icon(active)}
                <span className="text-[10px] font-ui font-semibold">{tab.label}</span>
              </button>
            )
          })}
        </div>
      </nav>

      {toast && (
        <Toast
          key={toast.key}
          message={toast.message}
          type={toast.type}
          onDismiss={() => setToast(null)}
        />
      )}
    </div>
  )
}
