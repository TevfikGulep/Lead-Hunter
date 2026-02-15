// StatusMultiSelect.js

const { useState, useEffect, useRef } = React;

// --- HELPER COMPONENT: MULTI-SELECT DROPDOWN ---
window.StatusMultiSelect = ({ selectedStatuses, onChange }) => {
    const [isOpen, setIsOpen] = useState(false);
    const wrapperRef = useRef(null);

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
                setIsOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const toggleStatus = (key) => {
        let newStatuses;
        if (selectedStatuses.includes(key)) {
            newStatuses = selectedStatuses.filter(s => s !== key);
        } else {
            newStatuses = [...selectedStatuses, key];
        }
        onChange(newStatuses);
    };

    const statusKeys = ['New', ...Object.keys(window.LEAD_STATUSES)];
    const count = selectedStatuses.length;
    
    return (
        <div className="relative" ref={wrapperRef}>
            <button 
                onClick={() => setIsOpen(!isOpen)} 
                className={`px-3 py-2 rounded-lg border text-sm font-medium outline-none flex items-center gap-2 transition-colors ${count > 0 ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : 'bg-slate-50 text-slate-600 border-slate-200 hover:border-slate-300'}`}
            >
                {count > 0 ? `${count} Durum Seçili` : 'Durum: Tümü'} 
                <window.Icon name="chevron-down" className="w-3 h-3 opacity-50"/>
            </button>
            
            {isOpen && (
                <div className="absolute top-full left-0 mt-1 w-64 bg-white border border-slate-200 rounded-xl shadow-xl z-50 max-h-80 overflow-y-auto p-2 animate-in fade-in zoom-in-95 duration-100">
                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 px-2">Durum Filtrele</div>
                    <div className="space-y-1">
                        {statusKeys.map(key => (
                            <div 
                                key={key} 
                                onClick={() => toggleStatus(key)}
                                className="flex items-center gap-2 p-2 hover:bg-slate-50 rounded-lg cursor-pointer select-none group transition-colors"
                            >
                                <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${selectedStatuses.includes(key) ? 'bg-indigo-600 border-indigo-600' : 'border-slate-300 bg-white group-hover:border-indigo-400'}`}>
                                    {selectedStatuses.includes(key) && <window.Icon name="check" className="w-3 h-3 text-white" />}
                                </div>
                                <span className={`text-xs font-medium ${selectedStatuses.includes(key) ? 'text-indigo-900' : 'text-slate-700'}`}>
                                    {key === 'New' ? 'New (Yeni)' : (window.LEAD_STATUSES[key]?.label || key)}
                                </span>
                            </div>
                        ))}
                    </div>
                    {count > 0 && (
                        <div className="pt-2 mt-2 border-t border-slate-100">
                            <button 
                                onClick={() => { onChange([]); setIsOpen(false); }} 
                                className="w-full py-1 text-center text-xs text-red-500 hover:text-red-700 font-bold hover:bg-red-50 rounded transition-colors"
                            >
                                Filtreyi Temizle
                            </button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};