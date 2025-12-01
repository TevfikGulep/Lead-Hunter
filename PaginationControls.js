// PaginationControls.js

// --- PAGINATION CONTROLS ---
window.PaginationControls = ({ currentPage, totalPages, setCurrentPage, totalRecords }) => (
    <div className="flex justify-between items-center p-4 border-t border-slate-200 bg-slate-50">
        <div className="text-xs text-slate-500">Toplam {totalRecords} kayıt. Sayfa {currentPage} / {totalPages || 1}</div>
        <div className="flex gap-2">
            <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="px-3 py-1 bg-white border rounded hover:bg-slate-100 disabled:opacity-50 text-sm">Önceki</button>
            <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage >= totalPages} className="px-3 py-1 bg-white border rounded hover:bg-slate-100 disabled:opacity-50 text-sm">Sonraki</button>
        </div>
    </div>
);