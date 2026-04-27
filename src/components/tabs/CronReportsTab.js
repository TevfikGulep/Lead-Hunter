window.CronReportsTab = () => {
    const [cronReport, setCronReport] = React.useState(null);
    const [cronLoading, setCronLoading] = React.useState(false);
    const [cronError, setCronError] = React.useState('');
    const [cronLimit, setCronLimit] = React.useState(150);

    const fetchCronReport = React.useCallback(async () => {
        const serverUrl = (window.APP_CONFIG && window.APP_CONFIG.SERVER_API_URL) || '';
        if (!serverUrl) {
            setCronError('Sunucu URL tanımlı değil.');
            return;
        }
        setCronLoading(true);
        setCronError('');
        try {
            const resp = await fetch(`${serverUrl}?type=cron_report&job=all&limit=${cronLimit}&_t=${Date.now()}`);
            const json = await resp.json();
            if (!json.success) throw new Error(json.error || 'Rapor alınamadı');
            setCronReport(json.data || null);
        } catch (e) {
            setCronError(e.message || 'Rapor yükleme hatası');
        }
        setCronLoading(false);
    }, [cronLimit]);

    React.useEffect(() => {
        fetchCronReport();
    }, [fetchCronReport]);

    return (
        <div className="space-y-6 pb-10">
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                    <div>
                        <h3 className="font-bold text-lg flex items-center gap-2">
                            <window.Icon name="activity" className="w-5 h-5 text-indigo-600" />
                            Cron İşlem Raporu
                        </h3>
                        <p className="text-xs text-slate-500 mt-1">Hunter ve Follow-up logları canlıdan okunur, özet + detay gösterilir.</p>
                    </div>
                    <div className="flex items-center gap-2">
                        <label className="text-xs font-bold text-slate-500">Kayıt Limiti</label>
                        <input
                            type="number"
                            min="20"
                            max="500"
                            value={cronLimit}
                            onChange={e => setCronLimit(Math.max(20, Math.min(500, parseInt(e.target.value) || 150)))}
                            className="w-20 px-2 py-1 border rounded text-sm"
                        />
                        <button
                            onClick={fetchCronReport}
                            disabled={cronLoading}
                            className={`px-3 py-2 rounded-lg text-sm font-bold text-white ${cronLoading ? 'bg-slate-400' : 'bg-indigo-600 hover:bg-indigo-700'}`}
                        >
                            {cronLoading ? 'Yükleniyor...' : 'Yenile'}
                        </button>
                    </div>
                </div>
                {cronError && <div className="mt-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">{cronError}</div>}
            </div>

            {['hunter', 'followup'].map(jobName => {
                const job = cronReport && cronReport[jobName];
                const summary = job && job.summary;
                const entries = (job && job.entries) || [];
                const title = jobName === 'hunter' ? 'Hunter.php' : 'Follow-up';
                return (
                    <div key={jobName} className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                        <div className="flex items-center justify-between mb-4">
                            <h4 className="font-bold text-base">{title}</h4>
                            <span className={`text-xs px-2 py-1 rounded font-bold ${summary?.status === 'ok' ? 'bg-emerald-100 text-emerald-700' : summary?.status === 'error' ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-600'}`}>
                                {summary?.status || 'unknown'}
                            </span>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-4 text-sm">
                            <div className="bg-slate-50 rounded p-3"><div className="text-xs text-slate-500">Son Çalışma</div><div className="font-semibold">{summary?.lastRunAt || '-'}</div></div>
                            <div className="bg-slate-50 rounded p-3"><div className="text-xs text-slate-500">Son Başarılı</div><div className="font-semibold">{summary?.lastSuccessAt || '-'}</div></div>
                            <div className="bg-slate-50 rounded p-3"><div className="text-xs text-slate-500">Son Hata</div><div className="font-semibold">{summary?.lastErrorAt || '-'}</div></div>
                            <div className="bg-slate-50 rounded p-3"><div className="text-xs text-slate-500">Hata / Başarı</div><div className="font-semibold">{summary ? `${summary.errorCount} / ${summary.successCount}` : '-'}</div></div>
                        </div>

                        <div className="mb-4">
                            <div className="text-xs font-bold text-slate-500 mb-2">İşlemde geçen siteler</div>
                            <div className="max-h-24 overflow-y-auto border rounded p-2 bg-slate-50 text-xs text-slate-700">
                                {summary?.sites && summary.sites.length > 0 ? summary.sites.join(', ') : 'Site kaydı yok'}
                            </div>
                        </div>

                        <div>
                            <div className="text-xs font-bold text-slate-500 mb-2">Detay loglar (en yeni üstte)</div>
                            <div className="h-72 overflow-y-auto bg-slate-900 text-slate-200 rounded-lg p-3 font-mono text-[11px] border border-slate-700">
                                {entries.length === 0 && <div className="text-slate-500">Kayıt bulunamadı.</div>}
                                {entries.map((entry, idx) => {
                                    const t = (entry.type || '').toUpperCase();
                                    const color =
                                        t === 'SUCCESS' ? 'text-emerald-400' :
                                        t === 'ERROR' ? 'text-red-400' :
                                        t === 'WARN' ? 'text-amber-400' :
                                        'text-slate-200';
                                    return (
                                        <div key={`${jobName}-${idx}`} className={`${color} whitespace-pre-wrap break-words mb-1`}>
                                            <span className="text-slate-500 mr-2">[{entry.timestamp || '--'}]</span>
                                            <span className="text-slate-400 mr-2">[{t || 'RAW'}]</span>
                                            {entry.message}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                );
            })}
        </div>
    );
};
