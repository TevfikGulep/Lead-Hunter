// PaginationControls.js
// GÜNCELLEME: Sayfa başına kayıt sayısı seçimi eklendi.

window.PaginationControls = ({ currentPage, totalPages, setCurrentPage, totalRecords, itemsPerPage, setItemsPerPage }) => (
    <div className="flex flex-col sm:flex-row justify-between items-center p-4 border-t border-slate-200 bg-slate-50 gap-4">
        <div className="flex items-center gap-4">
            <div className="text-xs text-slate-500">
                Toplam <strong>{totalRecords}</strong> kayıt. Sayfa {currentPage} / {totalPages || 1}
            </div>
            
            {/* Sayfa Başı Kayıt Seçimi */}
            {setItemsPerPage && (
                <div className="flex items-center gap-2">
                    <label className="text-xs text-slate-500 font-bold">Göster:</label>
                    <select 
                        value={itemsPerPage} 
                        onChange={(e) => {
                            setItemsPerPage(Number(e.target.value));
                            setCurrentPage(1); // Sayfa değişince başa dön
                        }} 
                        className="bg-white border border-slate-300 text-slate-700 text-xs rounded px-2 py-1 outline-none focus:border-indigo-500"
                    >
                        <option value={50}>50</option>
                        <option value={100}>100</option>
                        <option value={250}>250</option>
                        <option value={500}>500</option>
                    </select>
                </div>
            )}
        </div>

        <div className="flex gap-2">
            <button 
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))} 
                disabled={currentPage === 1} 
                className="px-3 py-1 bg-white border rounded hover:bg-slate-100 disabled:opacity-50 text-sm transition-colors"
            >
                Önceki
            </button>
            <button 
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} 
                disabled={currentPage >= totalPages} 
                className="px-3 py-1 bg-white border rounded hover:bg-slate-100 disabled:opacity-50 text-sm transition-colors"
            >
                Sonraki
            </button>
        </div>
    </div>
);
