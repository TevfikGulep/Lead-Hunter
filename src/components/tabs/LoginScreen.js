// LoginScreen.js

// Bağımlılık: Icon bileşeni (Icon.js) gereklidir.

// --- COMPONENT: LOGIN SCREEN ---
window.LoginScreen = ({ authEmail, setAuthEmail, passwordInput, setPasswordInput, handleLogin, loginError }) => (
    <div className="min-h-screen flex items-center justify-center bg-slate-900">
        <div className="bg-white p-8 rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex justify-center mb-6">
                <div className="w-16 h-16 bg-indigo-600 rounded-2xl flex items-center justify-center">
                    <window.Icon name="lock" className="w-8 h-8 text-white" />
                </div>
            </div>
            <h2 className="text-2xl font-bold text-center text-slate-800 mb-2">Lead Hunter Login</h2>
            <form onSubmit={handleLogin} className="space-y-4">
                <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Email</label>
                    <input 
                        type="email" 
                        value={authEmail} 
                        onChange={(e) => setAuthEmail(e.target.value)} 
                        className="w-full p-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none" 
                        placeholder="Email..." 
                    />
                </div>
                <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Şifre</label>
                    <input 
                        type="password" 
                        value={passwordInput} 
                        onChange={(e) => setPasswordInput(e.target.value)} 
                        className="w-full p-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none" 
                        placeholder="Şifre..." 
                    />
                </div>
                {loginError && <div className="text-red-500 text-xs bg-red-50 p-2 rounded">{loginError}</div>}
                <button type="submit" className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-xl transition-colors shadow-lg shadow-indigo-200">Giriş Yap</button>
            </form>
        </div>
    </div>
);