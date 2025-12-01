// TableComponents.js

// Bağımlılık: Icon bileşeni (Icon.js) gereklidir.

// --- SORT ICON COMPONENT ---
window.SortIcon = ({ column, sortConfig }) => {
    // Eğer şu anki sıralama bu kolona ait değilse, hover olunca görünen sönük bir ok göster
    if (sortConfig.key !== column) {
        return (
            <div className="w-4 h-4 opacity-0 group-hover:opacity-30">
                <window.Icon name="arrow-down" className="w-3 h-3"/>
            </div>
        );
    }
    
    // Eğer sıralama bu kolona aitse, yönüne göre renkli ok göster
    return sortConfig.direction === 'asc' ? 
        <window.Icon name="arrow-up" className="w-3 h-3 text-indigo-600"/> : 
        <window.Icon name="arrow-down" className="w-3 h-3 text-indigo-600"/>;
};