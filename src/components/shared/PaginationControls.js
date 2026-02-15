// PaginationControls.js
// GÜNCELLEME: UI Görünürlük iyileştirmesi

window.PaginationControls = ({ currentPage, totalPages, setCurrentPage, totalRecords, itemsPerPage, setItemsPerPage }) => (
    <div className="flex flex-col sm:flex-row justify-between items-center p-4 border-t border-slate-200 bg-slate-50 gap-4 select-none">
        <div className="flex items-center gap-4">
            <div className="text-xs text-slate-500 font-medium">
                Toplam <strong>{totalRecords}</strong> kayıt. Sayfa {currentPage} / {totalPages || 1}
            </div>
            
            {/* Sayfa Başı Kayıt Seçimi - Her zaman görünür */}
            <div className="flex items-center gap-2 bg-white border border-slate-300 rounded px-2 py-1 shadow-sm">
                <label className="text-[10px] uppercase font-bold text-slate-400">Göster:</label>
                <select 
                    value={itemsPerPage || 50} 
                    onChange={(e) => {
                        if(setItemsPerPage) {
                            setItemsPerPage(Number(e.target.value));
                            setCurrentPage(1);
                        }
                    }} 
                    className="bg-transparent text-slate-700 text-xs font-bold outline-none cursor-pointer"
                >
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                    <option value={250}>250</option>
                    <option value={500}>500</option>
                    <option value={1000}>1000</option>
                </select>
            </div>
        </div>

        <div className="flex gap-2">
            <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="px-3 py-1.5 bg-white border border-slate-300 rounded-lg hover:bg-indigo-50 hover:text-indigo-600 hover:border-indigo-200 disabled:opacity-50 disabled:hover:bg-white disabled:hover:text-slate-500 text-xs font-bold transition-all shadow-sm">
                <div className="flex items-center gap-1"><window.Icon name="chevron-left" className="w-3 h-3"/> Önceki</div>
            </button>
            <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage >= totalPages} className="px-3 py-1.5 bg-white border border-slate-300 rounded-lg hover:bg-indigo-50 hover:text-indigo-600 hover:border-indigo-200 disabled:opacity-50 disabled:hover:bg-white disabled:hover:text-slate-500 text-xs font-bold transition-all shadow-sm">
                <div className="flex items-center gap-1">Sonraki <window.Icon name="chevron-right" className="w-3 h-3"/></div>
            </button>
        </div>
    </div>
);
