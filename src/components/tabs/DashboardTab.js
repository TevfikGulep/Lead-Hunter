// DashboardTab.js
// GÜNCELLEME: Gelişmiş analitik dashboard - KPI, funnel, status dağılımı, stage performance, haftalık aktivite, lead kalite.

// --- Yardımcı Bileşenler ---

const FunnelBar = ({ label, count, total, color }) => {
    const width = total > 0 ? Math.max(5, (count / total) * 100) : 0;
    return (
        <div className="flex items-center gap-3 mb-2">
            <div className="w-32 text-sm text-right text-slate-600 font-medium truncate" title={label}>{label}</div>
            <div className="flex-1 bg-slate-100 rounded-full h-8 relative overflow-hidden">
                <div
                    className={`h-full rounded-full ${color} transition-all duration-500 flex items-center pl-3`}
                    style={{ width: `${width}%` }}
                >
                    {width > 10 && <span className="text-white text-sm font-bold">{count}</span>}
                </div>
                {width <= 10 && count > 0 && (
                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-500">{count}</span>
                )}
            </div>
            <div className="w-16 text-sm text-slate-400">{width.toFixed(0)}%</div>
        </div>
    );
};

const KpiCard = ({ value, label, borderColor, icon, trend }) => (
    <div className={`bg-white p-6 rounded-2xl border border-slate-200 shadow-sm border-t-4 ${borderColor}`}>
        <div className="flex items-center justify-between">
            <div>
                <div className="text-3xl font-bold text-slate-800">{value}</div>
                <div className="text-sm text-slate-500 mt-1">{label}</div>
            </div>
            <window.Icon name={icon} className="w-8 h-8 opacity-20 text-slate-400" />
        </div>
        {trend !== null && trend !== undefined && (
            <div className={`mt-2 text-xs font-medium flex items-center gap-1 ${trend >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                <window.Icon name={trend >= 0 ? 'trending-up' : 'trending-down'} className="w-3 h-3" />
                {trend >= 0 ? '+' : ''}{trend} bu hafta
            </div>
        )}
    </div>
);

// --- Lead Skor Hesaplama (helpers.js'deki window.calculateLeadScore kullanılır) ---
const getLeadScore = (lead) => window.calculateLeadScore(lead);


// --- Ana Bileşen ---

window.DashboardTab = ({
    crmData, filters, setFilters, selectedIds, toggleSelection, toggleSelectAll, selectedCount,
    setShowBulkModal, activeTab, onBulkCheck, isCheckingBulk, paginatedItems,
    currentPage, totalPages, setCurrentPage, totalRecords, setHistoryModalLead, getStageInfo,
    handleSort, sortConfig, onStageChange, workflow, bulkUpdateStatus, bulkUpdateLanguage, bulkUpdateStage,
    itemsPerPage, setItemsPerPage, selectAllFiltered, clearSelection, onExport
}) => {

    // --- Kapsamlı Analitik Hesaplamaları ---
    const analytics = React.useMemo(() => {
        const now = new Date();
        const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

        // Status counts
        const statusCounts = {};
        crmData.forEach(lead => {
            const key = lead.statusKey || 'NEW';
            statusCounts[key] = (statusCounts[key] || 0) + 1;
        });

        // KPI: Bu Hafta vs Geçen Hafta
        const addedThisWeek = crmData.filter(l => l.addedDate && new Date(l.addedDate) >= oneWeekAgo).length;
        const addedLastWeek = crmData.filter(l => {
            if (!l.addedDate) return false;
            const d = new Date(l.addedDate);
            return d >= twoWeeksAgo && d < oneWeekAgo;
        }).length;

        // KPI: Aktif Pipeline
        const activePipeline = crmData.filter(l => l.autoFollowupEnabled === true).length;

        // KPI: Dönüşüm Oranı
        const contacted = crmData.filter(l => l.stage > 0).length;
        const dealOn = statusCounts['DEAL_ON'] || 0;
        const conversionRate = contacted > 0 ? ((dealOn / contacted) * 100) : 0;

        // Funnel sayıları
        const funnelNew = crmData.filter(l => !l.statusKey || l.statusKey === 'NEW').length;
        const funnelReadyToSend = statusCounts['READY_TO_SEND'] || 0;
        const funnelNoReply = statusCounts['NO_REPLY'] || 0;
        const funnelInterested = (statusCounts['INTERESTED'] || 0) + (statusCounts['ASKED_MORE'] || 0) + (statusCounts['IN_PROCESS'] || 0);
        const funnelDealOn = statusCounts['DEAL_ON'] || 0;
        const funnelDenied = (statusCounts['DENIED'] || 0) + (statusCounts['DEAL_OFF'] || 0);

        // Stage Performance (workflow aşamalarına göre)
        const stagePerformance = [];
        if (workflow && workflow.length > 0) {
            workflow.forEach((step, idx) => {
                const stageIndex = idx + 1;
                const sent = crmData.filter(l => l.stage >= stageIndex).length;
                const opened = crmData.filter(l => l.stage >= stageIndex && l.mailOpenedAt).length;
                const replied = crmData.filter(l => {
                    if (l.stage < stageIndex) return false;
                    return ['INTERESTED', 'ASKED_MORE', 'IN_PROCESS', 'DEAL_ON'].includes(l.statusKey);
                }).length;
                const openRate = sent > 0 ? ((opened / sent) * 100) : 0;
                const replyRate = sent > 0 ? ((replied / sent) * 100) : 0;
                stagePerformance.push({ label: step.label, sent, opened, replied, openRate, replyRate });
            });
        }

        // Haftalık Aktivite (son 4 hafta)
        const weeklyActivity = [];
        for (let w = 0; w < 4; w++) {
            const weekStart = new Date(now.getTime() - (w + 1) * 7 * 24 * 60 * 60 * 1000);
            const weekEnd = new Date(now.getTime() - w * 7 * 24 * 60 * 60 * 1000);
            const label = w === 0 ? 'Bu Hafta' : w === 1 ? 'Geçen Hafta' : `${w + 1} Hafta Önce`;

            const newLeads = crmData.filter(l => {
                if (!l.addedDate) return false;
                const d = new Date(l.addedDate);
                return d >= weekStart && d < weekEnd;
            }).length;

            const emailsSent = crmData.filter(l => {
                if (!l.lastContactDate || l.stage === 0) return false;
                const d = new Date(l.lastContactDate);
                return d >= weekStart && d < weekEnd;
            }).length;

            const replies = crmData.filter(l => {
                if (!l.repliedAt && !l.statusChangedAt) return false;
                const d = new Date(l.repliedAt || l.statusChangedAt);
                if (d < weekStart || d >= weekEnd) return false;
                return ['INTERESTED', 'ASKED_MORE', 'IN_PROCESS', 'DEAL_ON'].includes(l.statusKey);
            }).length;

            const deals = crmData.filter(l => {
                if (!l.statusChangedAt || l.statusKey !== 'DEAL_ON') return false;
                const d = new Date(l.statusChangedAt);
                return d >= weekStart && d < weekEnd;
            }).length;

            weeklyActivity.push({ label, newLeads, emailsSent, replies, deals });
        }

        // Lead Kalite Dağılımı
        const scores = crmData.map(l => getLeadScore(l));
        const highQuality = scores.filter(s => s >= 70).length;
        const mediumQuality = scores.filter(s => s >= 40 && s < 70).length;
        const lowQuality = scores.filter(s => s < 40).length;

        return {
            total: crmData.length,
            addedThisWeek,
            addedThisWeekTrend: addedThisWeek - addedLastWeek,
            activePipeline,
            conversionRate,
            dealOn,
            contacted,
            statusCounts,
            funnelNew,
            funnelReadyToSend,
            funnelNoReply,
            funnelInterested,
            funnelDealOn,
            funnelDenied,
            stagePerformance,
            weeklyActivity: weeklyActivity.reverse(), // eskiden yeniye sırala
            highQuality,
            mediumQuality,
            lowQuality
        };
    }, [crmData, workflow]);

    // --- Mevcut Tablo Değişkenleri ---
    const displayItems = paginatedItems;
    const isAllPageSelected = paginatedItems.length > 0 && paginatedItems.every(i => selectedIds.has(i.id));
    const isGlobalSelectionActive = selectedIds.size > paginatedItems.length && selectedIds.size >= totalRecords;
    const canSelectAllGlobal = isAllPageSelected && totalRecords > paginatedItems.length && !isGlobalSelectionActive;
    const replyStatuses = ['ASKED_MORE', 'INTERESTED', 'IN_PROCESS', 'DEAL_ON', 'DEAL_OFF', 'DENIED', 'NOT_POSSIBLE', 'NEEDS_REVIEW', 'FOLLOW_LATER'];

    // Status renk haritası (badge için)
    const statusColorMap = {
        NEW: 'bg-slate-200 text-slate-700',
        READY_TO_SEND: 'bg-emerald-100 text-emerald-700',
        NO_REPLY: 'bg-slate-100 text-slate-600',
        ASKED_MORE: 'bg-blue-100 text-blue-700',
        INTERESTED: 'bg-indigo-100 text-indigo-700',
        IN_PROCESS: 'bg-purple-100 text-purple-700',
        DEAL_ON: 'bg-green-100 text-green-800',
        DEAL_OFF: 'bg-red-100 text-red-800',
        DENIED: 'bg-red-50 text-red-700',
        MAIL_ERROR: 'bg-yellow-100 text-yellow-700',
        NOT_VIABLE: 'bg-gray-200 text-gray-500',
        NOT_POSSIBLE: 'bg-gray-300 text-gray-600',
        NON_RESPONSIVE: 'bg-orange-100 text-orange-700',
        NEEDS_REVIEW: 'bg-amber-100 text-amber-700',
        FOLLOW_LATER: 'bg-cyan-100 text-cyan-700'
    };

    // Haftalık aktivite max değer (bar genişlikleri için)
    const maxWeeklyValue = React.useMemo(() => {
        if (!analytics.weeklyActivity.length) return 1;
        let max = 1;
        analytics.weeklyActivity.forEach(w => {
            max = Math.max(max, w.newLeads, w.emailsSent, w.replies, w.deals);
        });
        return max;
    }, [analytics.weeklyActivity]);

    return (
        <div className="space-y-6 animate-in fade-in duration-500">

            {/* ===== SECTION 1: KPI CARDS ===== */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <KpiCard
                    value={analytics.total}
                    label="Toplam Lead"
                    borderColor="border-t-indigo-500"
                    icon="users"
                    trend={null}
                />
                <KpiCard
                    value={analytics.addedThisWeek}
                    label="Bu Hafta Eklenen"
                    borderColor="border-t-green-500"
                    icon="plus-circle"
                    trend={analytics.addedThisWeekTrend}
                />
                <KpiCard
                    value={analytics.activePipeline}
                    label="Aktif Pipeline"
                    borderColor="border-t-purple-500"
                    icon="clock"
                    trend={null}
                />
                <KpiCard
                    value={`%${analytics.conversionRate.toFixed(1)}`}
                    label={`Dönüşüm Oranı (${analytics.dealOn}/${analytics.contacted})`}
                    borderColor="border-t-orange-500"
                    icon="target"
                    trend={null}
                />
            </div>

            {/* ===== SECTION 2 & 3: FUNNEL + STATUS DAĞILIMI ===== */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Pipeline Funnel (sol - 2 sütun) */}
                <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
                    <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                        <window.Icon name="filter" className="w-5 h-5 text-indigo-500" /> Pipeline Funnel
                    </h3>
                    <div className="space-y-1">
                        <FunnelBar label="Yeni (NEW)" count={analytics.funnelNew} total={analytics.total} color="bg-slate-400" />
                        <FunnelBar label="Gönderime Hazır" count={analytics.funnelReadyToSend} total={analytics.total} color="bg-emerald-500" />
                        <FunnelBar label="Cevap Yok" count={analytics.funnelNoReply} total={analytics.total} color="bg-blue-400" />
                        <FunnelBar label="İlgilendi" count={analytics.funnelInterested} total={analytics.total} color="bg-indigo-500" />
                        <FunnelBar label="Deal On" count={analytics.funnelDealOn} total={analytics.total} color="bg-green-500" />
                        <div className="border-t border-slate-100 mt-3 pt-3">
                            <FunnelBar label="Reddedilen / Off" count={analytics.funnelDenied} total={analytics.total} color="bg-red-400" />
                        </div>
                    </div>
                </div>

                {/* Status Distribution (sağ - 1 sütun) */}
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
                    <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                        <window.Icon name="pie-chart" className="w-5 h-5 text-purple-500" /> Durum Dağılımı
                    </h3>
                    <div className="flex flex-wrap gap-2">
                        {Object.entries(analytics.statusCounts)
                            .sort((a, b) => b[1] - a[1])
                            .map(([key, count]) => {
                                const statusDef = window.LEAD_STATUSES && window.LEAD_STATUSES[key];
                                const colorClass = statusColorMap[key] || 'bg-slate-100 text-slate-600';
                                return (
                                    <div key={key} className={`px-3 py-2 rounded-lg text-xs font-bold ${colorClass} flex items-center gap-1.5`}>
                                        <span>{statusDef ? statusDef.label : key}</span>
                                        <span className="bg-white/50 rounded-full px-1.5 py-0.5 text-[10px]">{count}</span>
                                    </div>
                                );
                            })
                        }
                        {Object.keys(analytics.statusCounts).length === 0 && (
                            <div className="text-sm text-slate-400 italic">Henüz veri yok</div>
                        )}
                    </div>
                </div>
            </div>

            {/* ===== SECTION 4: STAGE PERFORMANCE TABLE ===== */}
            {analytics.stagePerformance.length > 0 && (
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="p-6 border-b bg-slate-50/50">
                        <h3 className="font-bold text-slate-800 flex items-center gap-2">
                            <window.Icon name="bar-chart-2" className="w-5 h-5 text-blue-500" /> Aşamalara Göre Performans
                        </h3>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm">
                            <thead className="bg-slate-50 text-slate-500">
                                <tr>
                                    <th className="p-4 font-medium">Aşama</th>
                                    <th className="p-4 font-medium text-center">Gönderilen</th>
                                    <th className="p-4 font-medium text-center">Açılan</th>
                                    <th className="p-4 font-medium text-center">Cevaplanan</th>
                                    <th className="p-4 font-medium text-center">Açılma %</th>
                                    <th className="p-4 font-medium text-center">Cevap %</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {analytics.stagePerformance.map((stage, idx) => (
                                    <tr key={idx} className="hover:bg-slate-50">
                                        <td className="p-4 font-medium text-slate-700">
                                            <span className="inline-flex items-center gap-2">
                                                <span className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-600 text-xs font-bold flex items-center justify-center">{idx + 1}</span>
                                                {stage.label}
                                            </span>
                                        </td>
                                        <td className="p-4 text-center font-mono">{stage.sent}</td>
                                        <td className="p-4 text-center font-mono">{stage.opened}</td>
                                        <td className="p-4 text-center font-mono">{stage.replied}</td>
                                        <td className="p-4 text-center">
                                            <div className="inline-flex items-center gap-1">
                                                <div className="w-16 bg-slate-100 rounded-full h-2 overflow-hidden">
                                                    <div className="h-full bg-blue-500 rounded-full" style={{ width: `${Math.min(100, stage.openRate)}%` }} />
                                                </div>
                                                <span className="text-xs font-bold text-slate-600">{stage.openRate.toFixed(1)}%</span>
                                            </div>
                                        </td>
                                        <td className="p-4 text-center">
                                            <div className="inline-flex items-center gap-1">
                                                <div className="w-16 bg-slate-100 rounded-full h-2 overflow-hidden">
                                                    <div className="h-full bg-green-500 rounded-full" style={{ width: `${Math.min(100, stage.replyRate)}%` }} />
                                                </div>
                                                <span className="text-xs font-bold text-slate-600">{stage.replyRate.toFixed(1)}%</span>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* ===== SECTION 5: HAFTALIK AKTİVİTE ===== */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
                <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                    <window.Icon name="activity" className="w-5 h-5 text-green-500" /> Haftalık Aktivite
                </h3>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="text-slate-500">
                                <th className="text-left p-2 w-32 font-medium">Hafta</th>
                                <th className="text-left p-2 font-medium">Yeni Lead</th>
                                <th className="text-left p-2 font-medium">Mail Gönderilen</th>
                                <th className="text-left p-2 font-medium">Cevap Alınan</th>
                                <th className="text-left p-2 font-medium">Deal</th>
                            </tr>
                        </thead>
                        <tbody>
                            {analytics.weeklyActivity.map((week, idx) => (
                                <tr key={idx} className="border-t border-slate-50">
                                    <td className="p-2 font-medium text-slate-700 whitespace-nowrap">{week.label}</td>
                                    <td className="p-2">
                                        <div className="flex items-center gap-2">
                                            <div className="flex-1 bg-slate-100 rounded h-5 overflow-hidden max-w-[200px]">
                                                <div className="h-full bg-indigo-400 rounded transition-all duration-500" style={{ width: `${maxWeeklyValue > 0 ? (week.newLeads / maxWeeklyValue) * 100 : 0}%` }} />
                                            </div>
                                            <span className="text-xs font-bold text-slate-600 w-8">{week.newLeads}</span>
                                        </div>
                                    </td>
                                    <td className="p-2">
                                        <div className="flex items-center gap-2">
                                            <div className="flex-1 bg-slate-100 rounded h-5 overflow-hidden max-w-[200px]">
                                                <div className="h-full bg-blue-400 rounded transition-all duration-500" style={{ width: `${maxWeeklyValue > 0 ? (week.emailsSent / maxWeeklyValue) * 100 : 0}%` }} />
                                            </div>
                                            <span className="text-xs font-bold text-slate-600 w-8">{week.emailsSent}</span>
                                        </div>
                                    </td>
                                    <td className="p-2">
                                        <div className="flex items-center gap-2">
                                            <div className="flex-1 bg-slate-100 rounded h-5 overflow-hidden max-w-[200px]">
                                                <div className="h-full bg-green-400 rounded transition-all duration-500" style={{ width: `${maxWeeklyValue > 0 ? (week.replies / maxWeeklyValue) * 100 : 0}%` }} />
                                            </div>
                                            <span className="text-xs font-bold text-slate-600 w-8">{week.replies}</span>
                                        </div>
                                    </td>
                                    <td className="p-2">
                                        <div className="flex items-center gap-2">
                                            <div className="flex-1 bg-slate-100 rounded h-5 overflow-hidden max-w-[200px]">
                                                <div className="h-full bg-orange-400 rounded transition-all duration-500" style={{ width: `${maxWeeklyValue > 0 ? (week.deals / maxWeeklyValue) * 100 : 0}%` }} />
                                            </div>
                                            <span className="text-xs font-bold text-slate-600 w-8">{week.deals}</span>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* ===== SECTION 6: LEAD KALİTE DAĞILIMI ===== */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
                <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                    <window.Icon name="award" className="w-5 h-5 text-amber-500" /> Lead Kalite Dağılımı
                </h3>
                <div className="space-y-3">
                    {/* Yüksek */}
                    <div className="flex items-center gap-3">
                        <div className="w-32 text-sm text-right font-medium text-green-700">Yüksek (70-100)</div>
                        <div className="flex-1 bg-slate-100 rounded-full h-7 overflow-hidden">
                            <div
                                className="h-full bg-green-500 rounded-full transition-all duration-500 flex items-center pl-3"
                                style={{ width: `${analytics.total > 0 ? Math.max(3, (analytics.highQuality / analytics.total) * 100) : 0}%` }}
                            >
                                {analytics.highQuality > 0 && <span className="text-white text-xs font-bold">{analytics.highQuality}</span>}
                            </div>
                        </div>
                        <div className="w-16 text-sm text-slate-400">
                            {analytics.total > 0 ? ((analytics.highQuality / analytics.total) * 100).toFixed(0) : 0}%
                        </div>
                    </div>
                    {/* Orta */}
                    <div className="flex items-center gap-3">
                        <div className="w-32 text-sm text-right font-medium text-yellow-700">Orta (40-69)</div>
                        <div className="flex-1 bg-slate-100 rounded-full h-7 overflow-hidden">
                            <div
                                className="h-full bg-yellow-400 rounded-full transition-all duration-500 flex items-center pl-3"
                                style={{ width: `${analytics.total > 0 ? Math.max(3, (analytics.mediumQuality / analytics.total) * 100) : 0}%` }}
                            >
                                {analytics.mediumQuality > 0 && <span className="text-white text-xs font-bold">{analytics.mediumQuality}</span>}
                            </div>
                        </div>
                        <div className="w-16 text-sm text-slate-400">
                            {analytics.total > 0 ? ((analytics.mediumQuality / analytics.total) * 100).toFixed(0) : 0}%
                        </div>
                    </div>
                    {/* Düşük */}
                    <div className="flex items-center gap-3">
                        <div className="w-32 text-sm text-right font-medium text-slate-500">Düşük (0-39)</div>
                        <div className="flex-1 bg-slate-100 rounded-full h-7 overflow-hidden">
                            <div
                                className="h-full bg-slate-400 rounded-full transition-all duration-500 flex items-center pl-3"
                                style={{ width: `${analytics.total > 0 ? Math.max(3, (analytics.lowQuality / analytics.total) * 100) : 0}%` }}
                            >
                                {analytics.lowQuality > 0 && <span className="text-white text-xs font-bold">{analytics.lowQuality}</span>}
                            </div>
                        </div>
                        <div className="w-16 text-sm text-slate-400">
                            {analytics.total > 0 ? ((analytics.lowQuality / analytics.total) * 100).toFixed(0) : 0}%
                        </div>
                    </div>
                </div>
            </div>

            {/* ===== MEVCUT: FILTER BAR ===== */}
            <window.FilterBar filters={filters} setFilters={setFilters} selectedCount={selectedCount} selectedIds={selectedIds} setShowBulkModal={setShowBulkModal} activeTab={activeTab} onBulkCheck={onBulkCheck} isCheckingBulk={isCheckingBulk} onBulkStatusChange={bulkUpdateStatus} onBulkLanguageChange={bulkUpdateLanguage} onBulkStageChange={bulkUpdateStage} onExport={onExport} />

            {/* ===== MEVCUT: AKTİF SÜREÇ TABLOSU ===== */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="p-6 border-b flex justify-between items-center bg-slate-50/50">
                    <h3 className="font-bold text-slate-800 flex items-center gap-2">
                        <window.Icon name="trending-up" className="w-5 h-5 text-indigo-500" /> Aktif Süreç
                    </h3>
                </div>
                <div className="overflow-x-auto">
                    {canSelectAllGlobal && (
                        <div className="bg-indigo-50 border-b border-indigo-100 p-2 text-center text-xs text-indigo-800 animate-in slide-in-from-top-2 flex items-center justify-center gap-1">
                            Bu sayfadaki <strong>{paginatedItems.length}</strong> kayıt seçildi.
                            <button onClick={selectAllFiltered} className="ml-1 font-bold underline hover:text-indigo-900 cursor-pointer">Listenin tamamındaki {totalRecords} kaydı seç.</button>
                        </div>
                    )}
                    {isGlobalSelectionActive && (
                        <div className="bg-green-50 border-b border-green-100 p-2 text-center text-xs text-green-800 animate-in slide-in-from-top-2 flex items-center justify-center gap-1">
                            <window.Icon name="check-circle" className="w-3 h-3"/>
                            Listedeki <strong>{totalRecords}</strong> kaydın tamamı seçildi.
                            <button onClick={clearSelection} className="ml-2 font-bold underline hover:text-green-900 cursor-pointer">Seçimi Temizle</button>
                        </div>
                    )}

                    <table className="w-full text-left text-sm">
                        <thead className="bg-slate-50 text-slate-500">
                            <tr>
                                <th className="p-4 w-10"><input type="checkbox" className="custom-checkbox" checked={isAllPageSelected} onChange={() => toggleSelectAll(paginatedItems)}/></th>

                                {/* SIRALANABİLİR BAŞLIKLAR */}
                                <th className="p-4 cursor-pointer hover:text-indigo-600 transition-colors select-none" onClick={() => handleSort('url')}>
                                    <div className="flex items-center gap-1">Site <window.SortIcon column="url" sortConfig={sortConfig}/></div>
                                </th>
                                <th className="p-4 cursor-pointer hover:text-indigo-600 transition-colors select-none" onClick={() => handleSort('contactName')}>
                                    <div className="flex items-center gap-1">İsim <window.SortIcon column="contactName" sortConfig={sortConfig}/></div>
                                </th>
                                <th className="p-4 cursor-pointer hover:text-indigo-600 transition-colors select-none" onClick={() => handleSort('email')}>
                                    <div className="flex items-center gap-1">Email <window.SortIcon column="email" sortConfig={sortConfig}/></div>
                                </th>
                                <th className="p-4 cursor-pointer hover:text-indigo-600 transition-colors select-none" onClick={() => handleSort('potential')}>
                                    <div className="flex items-center gap-1">Trafik <window.SortIcon column="potential" sortConfig={sortConfig}/></div>
                                </th>
                                <th className="p-4 cursor-pointer hover:text-indigo-600 transition-colors select-none" onClick={() => handleSort('stage')}>
                                    <div className="flex items-center gap-1">Son Gönderilen <window.SortIcon column="stage" sortConfig={sortConfig}/></div>
                                </th>
                                <th className="p-4 cursor-pointer hover:text-indigo-600 transition-colors select-none" onClick={() => handleSort('lastContactDate')}>
                                    <div className="flex items-center gap-1">Son Temas <window.SortIcon column="lastContactDate" sortConfig={sortConfig}/></div>
                                </th>
                                <th className="p-4 cursor-pointer hover:text-indigo-600 transition-colors select-none" onClick={() => handleSort('addedDate')}>
                                    <div className="flex items-center gap-1">Eklenme <window.SortIcon column="addedDate" sortConfig={sortConfig}/></div>
                                </th>
                                <th className="p-4 cursor-pointer hover:text-indigo-600 transition-colors select-none" onClick={() => handleSort('leadScore')}>
                                    <div className="flex items-center gap-1">Skor <window.SortIcon column="leadScore" sortConfig={sortConfig}/></div>
                                </th>
                                <th className="p-4 cursor-pointer hover:text-indigo-600 transition-colors select-none" onClick={() => handleSort('statusKey')}>
                                    <div className="flex items-center gap-1">Durum <window.SortIcon column="statusKey" sortConfig={sortConfig}/></div>
                                </th>

                                {/* OTOMATİK TAKİP SÜTUNU */}
                                <th className="p-4 text-center" title="Otomatik Takip">
                                    <div className="flex items-center justify-center gap-1"><window.Icon name="clock" className="w-4 h-4" /> Takip</div>
                                </th>

                                <th className="p-4">Aksiyon</th>
                                <th className="p-4 text-right">Geçmiş</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {displayItems.map(lead => {
                                const nextStageInfo = getStageInfo(lead.stage, lead.language);

                                const isReplied = replyStatuses.includes(lead.statusKey);
                                const isMailOpened = !!lead.mailOpenedAt;

                                // Otomatik takip durumu
                                const isAutoFollowupActive = lead.autoFollowupEnabled === true;
                                const followupCount = lead.followupCount || 0;

                                let dotColor = 'bg-red-200';
                                let dotTitle = 'Mail henüz okunmadı';

                                if (isReplied) {
                                    dotColor = 'bg-blue-500';
                                    dotTitle = 'Cevap Alındı';
                                } else if (isMailOpened) {
                                    dotColor = 'bg-green-500';
                                    dotTitle = `Mail Okundu: ${new Date(lead.mailOpenedAt).toLocaleString('tr-TR')}`;
                                }

                                return (
                                    <tr key={lead.id} className="hover:bg-slate-50">
                                        <td className="p-4"><input type="checkbox" className="custom-checkbox" checked={selectedIds.has(lead.id)} onChange={() => toggleSelection(lead.id)}/></td>
                                        <td className="p-4 font-medium">
                                            <div className="flex items-center gap-2">
                                                <div className={`w-3 h-3 rounded-full shadow-sm ${dotColor} ${isMailOpened && !isReplied ? 'animate-pulse' : ''}`} title={dotTitle}></div>

                                                <span onClick={() => toggleSelection(lead.id)} className="cursor-pointer hover:text-indigo-600 transition-colors">
                                                    {window.cleanDomain(lead.url)}
                                                </span>
                                                <a href={`http://${window.cleanDomain(lead.url)}`} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="text-slate-400 hover:text-indigo-500" title="Siteye Git">
                                                    <window.Icon name="external-link" className="w-4 h-4"/>
                                                </a>
                                            </div>
                                        </td>

                                        {/*İSİM SÜTUNU */}
                                        <td className="p-4 text-sm text-slate-600 truncate max-w-[120px]" title={lead.contactName}>{lead.contactName || '-'}</td>

                                        <td className="p-4 text-sm text-slate-600">{lead.email || '-'}</td>
                                        <td className="p-4 text-slate-600 font-mono text-xs">
                                            {lead.trafficStatus && lead.trafficStatus.label ? (
                                                <span className={`flex items-center gap-1 ${lead.trafficStatus.viable ? 'text-green-600 font-bold' : 'text-slate-400'}`}>
                                                    <window.Icon name={lead.trafficStatus.viable ? "trending-up" : "minus"} className="w-3 h-3"/> {lead.trafficStatus.label}
                                                </span>
                                            ) : <span className="text-slate-300">-</span>}
                                        </td>

                                        <td className="p-4">
                                            <div className="relative inline-block">
                                                <select
                                                    value={lead.stage || 0}
                                                    onChange={(e) => onStageChange(lead.id, parseInt(e.target.value))}
                                                    onClick={(e) => e.stopPropagation()}
                                                    className="appearance-none bg-indigo-50 text-indigo-700 px-2 py-1 pr-6 rounded text-xs font-bold border-none outline-none cursor-pointer focus:ring-2 focus:ring-indigo-300"
                                                >
                                                    <option value={0}>Henüz Yok</option>
                                                    {workflow && workflow.map((step, idx) => (
                                                        <option key={idx} value={idx + 1}>{step.label}</option>
                                                    ))}
                                                </select>
                                                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-1 text-indigo-700">
                                                    <window.Icon name="chevron-down" className="w-3 h-3"/>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="p-4 text-slate-500">{lead.lastContactDate ? new Date(lead.lastContactDate).toLocaleDateString('tr-TR') : '-'}</td>
                                        <td className="p-4 text-slate-500 text-xs">{lead.addedDate ? new Date(lead.addedDate).toLocaleDateString('tr-TR') : '-'}</td>

                                        <td className="p-4 text-xs">
                                            {(() => {
                                                const score = lead.leadScore != null ? lead.leadScore : getLeadScore(lead);
                                                const sl = window.getScoreLabel(score);
                                                return <span className={`font-bold ${sl.color}`}>{score}</span>;
                                            })()}
                                        </td>
                                        <td className="p-4">
                                            <span className={`px-2 py-1 rounded text-xs font-bold border ${window.LEAD_STATUSES[lead.statusKey]?.color || 'bg-gray-100'}`}>
                                                {window.LEAD_STATUSES[lead.statusKey]?.label || lead.statusLabel || 'New'}
                                            </span>
                                        </td>

                                        {/* OTOMATİK TAKİP İKONU */}
                                        <td className="p-4 text-center">
                                            {isAutoFollowupActive ? (
                                                <div className="inline-flex items-center gap-1 px-2 py-1 bg-orange-100 text-orange-700 rounded-full text-xs font-bold" title={`Otomatik Takip Aktif - ${followupCount} takip gönderildi`}>
                                                    <window.Icon name="clock" className="w-3 h-3" />
                                                    {followupCount}/5
                                                </div>
                                            ) : (
                                                <span className="text-slate-300 text-xs" title="Otomatik Takip Pasif">
                                                    <window.Icon name="clock" className="w-4 h-4 opacity-30" />
                                                </span>
                                            )}
                                        </td>

                                        <td className="p-4">
                                            {nextStageInfo.isFinished ?
                                                <span className="text-green-600 font-bold">Bitti</span> :
                                                <span className={`px-2 py-1 rounded text-xs font-bold ${lead.needsFollowUp ? 'bg-orange-100 text-orange-700 animate-pulse' : 'bg-slate-100 text-slate-600'}`}>
                                                    {lead.needsFollowUp ? `Gönder: ${nextStageInfo.label}` : `Bekle: ${nextStageInfo.label}`}
                                                </span>
                                            }
                                        </td>
                                        <td className="p-4 text-right">
                                            <button onClick={() => setHistoryModalLead(lead)} className="text-slate-400 hover:text-indigo-600">
                                                <window.Icon name="history" className="w-4 h-4" />
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
                <window.PaginationControls
                    currentPage={currentPage}
                    totalPages={totalPages}
                    setCurrentPage={setCurrentPage}
                    totalRecords={totalRecords}
                    itemsPerPage={itemsPerPage}
                    setItemsPerPage={setItemsPerPage}
                />
            </div>
        </div>
    );
};
