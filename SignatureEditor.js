// SignatureEditor.js

const { useEffect, useRef } = React;

// Bağımlılık: Icon bileşeni (Icon.js) gereklidir.

// --- COMPONENT: SIGNATURE EDITOR ---
window.SignatureEditor = ({ value, onChange }) => {
    const editorRef = useRef(null);

    const execCmd = (command, val = null) => {
        document.execCommand(command, false, val);
        if (editorRef.current) {
            editorRef.current.focus();
            onChange(editorRef.current.innerHTML); 
        }
    };

    const addImage = () => {
        const url = prompt("Görsel URL'sini yapıştırın (Örn: https://site.com/logo.png):");
        if (url) execCmd('insertImage', url);
    };

    const addLink = () => {
        const url = prompt("Link URL'sini girin:");
        if (url) execCmd('createLink', url);
    };

    useEffect(() => {
        if (editorRef.current && !editorRef.current.innerHTML && value) {
            editorRef.current.innerHTML = value;
        }
    }, []);

    return (
        <div className="border border-slate-300 rounded-xl overflow-hidden bg-white shadow-sm">
            <div className="flex gap-1 p-2 bg-slate-50 border-b border-slate-200 items-center">
                <button onClick={() => execCmd('bold')} className="p-1.5 hover:bg-slate-200 rounded text-slate-700" title="Kalın"><strong className="font-serif">B</strong></button>
                <button onClick={() => execCmd('italic')} className="p-1.5 hover:bg-slate-200 rounded text-slate-700" title="İtalik"><i className="font-serif">I</i></button>
                <button onClick={() => execCmd('underline')} className="p-1.5 hover:bg-slate-200 rounded text-slate-700" title="Altı Çizili"><u className="font-serif">U</u></button>
                <div className="w-px h-5 bg-slate-300 mx-1"></div>
                <button onClick={addImage} className="p-1.5 hover:bg-slate-200 rounded text-slate-700 flex items-center gap-1" title="Resim Ekle"><window.Icon name="image" className="w-4 h-4"/></button>
                <button onClick={addLink} className="p-1.5 hover:bg-slate-200 rounded text-slate-700" title="Link Ekle"><window.Icon name="link" className="w-4 h-4"/></button>
                <div className="w-px h-5 bg-slate-300 mx-1"></div>
                <button onClick={() => execCmd('justifyLeft')} className="p-1.5 hover:bg-slate-200 rounded text-slate-700"><window.Icon name="align-left" className="w-4 h-4"/></button>
                <button onClick={() => execCmd('justifyCenter')} className="p-1.5 hover:bg-slate-200 rounded text-slate-700"><window.Icon name="align-center" className="w-4 h-4"/></button>
            </div>
            <div 
                ref={editorRef}
                className="rich-editor p-4 text-sm text-slate-700 font-sans leading-relaxed"
                contentEditable
                onInput={(e) => onChange(e.currentTarget.innerHTML)}
                onBlur={(e) => onChange(e.currentTarget.innerHTML)}
                placeholder="İmzanızı buraya oluşturun..."
            />
        </div>
    );
};