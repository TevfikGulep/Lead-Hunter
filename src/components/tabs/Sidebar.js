// Sidebar.js

// Bağımlılık: Icon bileşeni (Icon.js) gereklidir.

// --- COMPONENT: SIDEBAR ---
window.Sidebar = ({ activeTab, setActiveTab, isDbConnected }) => (
    <div className="w-64 bg-slate-900 text-slate-300 flex flex-col shadow-2xl z-10 shrink-0">
        <div className="p-6 border-b border-slate-800">
            <h1 className="text-xl font-bold text-white flex items-center gap-2 tracking-tight">
                <window.Icon name="settings" className="w-6 h-6 text-indigo-500" /> Lead Hunter
            </h1>
            <p className="text-[10px] text-slate-500 mt-1 uppercase tracking-wider font-semibold">v25.14 Modular</p>
        </div>
        <nav className="flex-1 p-4 space-y-2">
            {[ 
                { id: 'dashboard', icon: 'layout-dashboard', label: 'Genel Bakış' }, 
                { id: 'hunter', icon: 'search', label: 'Site Avcısı' }, 
                { id: 'crm', icon: 'users', label: 'Veritabanı' }, 
                { id: 'settings', icon: 'settings', label: 'Ayarlar' } 
            ].map(item => (
                <button 
                    key={item.id} 
                    onClick={() => setActiveTab(item.id)} 
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200 ${activeTab === item.id ? 'bg-indigo-600 text-white shadow-lg' : 'hover:bg-slate-800'}`}
                >
                    <window.Icon name={item.icon} className="w-5 h-5" /> {item.label}
                </button>
            ))}
        </nav>
        <div className="p-4 border-t border-slate-800">
            <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] uppercase font-bold">Veri Modu</span>
                {isDbConnected ? 
                    <span className="text-[10px] bg-green-900 text-green-400 px-2 py-0.5 rounded flex items-center gap-1"><window.Icon name="cloud" className="w-3 h-3"/> Online</span> : 
                    <span className="text-[10px] bg-yellow-900 text-yellow-400 px-2 py-0.5 rounded flex items-center gap-1"><window.Icon name="cloud-off" className="w-3 h-3"/> Local</span>
                }
            </div>
        </div>
    </div>
);