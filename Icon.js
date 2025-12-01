// Icon.js

const { useEffect, useRef } = React;

// --- ICON COMPONENT ---
window.Icon = ({ name, className, onClick }) => {
    const containerRef = useRef(null);

    useEffect(() => {
        if (containerRef.current) {
            containerRef.current.innerHTML = '';
            const i = document.createElement('i');
            i.setAttribute('data-lucide', name);
            if (className) i.setAttribute('class', className);
            containerRef.current.appendChild(i);
            if (window.lucide && window.lucide.createIcons) {
                window.lucide.createIcons({ root: containerRef.current });
            }
        }
    }, [name, className]);

    return (
        <span 
            ref={containerRef} 
            onClick={onClick} 
            style={{ display: 'contents', cursor: onClick ? 'pointer' : 'inherit' }}
        />
    );
};