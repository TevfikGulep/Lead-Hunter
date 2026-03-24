// LeadHunter.js
// GÜNCELLEME: Rapor Export fonksiyonu tab'lara iletiliyor.

const { useState, useEffect } = React;

const LeadHunter = () => {
    const [historyModalLead, setHistoryModalLead] = useState(null);
    const [showImportModal, setShowImportModal] = useState(false);
    const [leads, setLeads] = useState([]);
    const [hunterSort, setHunterSort] = useState({ key: 'traffic', direction: 'desc' });
    const [hunterFilterType, setHunterFilterType] = useState('ALL');

    const auth = window.useLeadHunterAuth();
    const data = window.useLeadHunterData(auth.dbInstance, auth.settings, auth.activeTab);
    const actions = window.useLeadHunterActions(auth.dbInstance, auth.isDbConnected, data.crmData, data.setCrmData, auth.settings, setHistoryModalLead);

    const services = window.useLeadHunterServices(
        auth.dbInstance,
        auth.isDbConnected,
        auth.settings,
        data.crmData,
        data.setCrmData,
        data.selectedIds,
        data.setSelectedIds,
        leads,
        setLeads,
        actions.getStageInfo,
        auth.searchLocation
    );

    const processedHunterLeads = leads
        .filter(l => {
            if (hunterFilterType === 'VIABLE') return l.trafficStatus?.viable;
            if (hunterFilterType === 'LOW') return l.trafficStatus && !l.trafficStatus.viable;
            return true;
        })
        .sort((a, b) => {
            let valA = a.trafficStatus?.value || 0;
            let valB = b.trafficStatus?.value || 0;
            if (hunterSort.direction === 'asc') return valA - valB;
            return valB - valA;
        });

    if (!auth.isAuthenticated) {
        return (
            <window.LoginScreen
                authEmail={auth.authEmail}
                setAuthEmail={auth.setAuthEmail}
                passwordInput={auth.passwordInput}
                setPasswordInput={auth.setPasswordInput}
                handleLogin={auth.handleLogin}
                loginError={auth.loginError}
            />
        );
    }

    return (
        <div className="flex h-screen bg-slate-50 font-sans text-slate-800 overflow-hidden">
            <window.Sidebar activeTab={auth.activeTab} setActiveTab={auth.setActiveTab} isDbConnected={auth.isDbConnected} />
            <div className="flex-1 overflow-y-auto bg-slate-100 relative">
                <div className="w-full mx-auto p-6 md:p-8">
                    <div className="mb-8 flex justify-between items-end border-b border-slate-200 pb-4">
                        <h2 className="text-3xl font-bold text-slate-800 tracking-tight">
                            {auth.activeTab === 'dashboard' ? 'Yönetim Paneli' :
                                auth.activeTab === 'hunter' ? 'Site Avcısı' :
                                    auth.activeTab === 'crm' ? 'Müşteri Listesi' : 'Ayarlar'}
                        </h2>
                    </div>

                    {auth.activeTab === 'dashboard' && (
                        <window.DashboardTab
                            crmData={data.crmData}
                            filters={data.filters}
                            setFilters={data.setFilters}
                            selectedIds={data.selectedIds}
                            toggleSelection={data.toggleSelection}
                            toggleSelectAll={data.toggleSelectAll}
                            selectedCount={data.selectedIds.size}
                            setShowBulkModal={services.setShowBulkModal}
                            activeTab={auth.activeTab}
                            fixAllTrafficData={services.fixAllTrafficData}
                            onBulkCheck={services.handleBulkReplyCheck}
                            isCheckingBulk={services.isCheckingBulk}
                            paginatedItems={data.getPaginatedData()}
                            currentPage={data.currentPage}
                            totalPages={data.totalPages}
                            setCurrentPage={data.setCurrentPage}
                            totalRecords={data.processedData.length}
                            itemsPerPage={data.itemsPerPage}
                            setItemsPerPage={data.setItemsPerPage}
                            selectAllFiltered={data.selectAllFiltered}
                            clearSelection={data.clearSelection}
                            setHistoryModalLead={setHistoryModalLead}
                            getStageInfo={actions.getStageInfo}
                            handleSort={data.handleSort}
                            sortConfig={data.sortConfig}
                            onStageChange={actions.handleManualStageUpdate}
                            workflow={auth.settings.workflowTR}
                            bulkUpdateStatus={services.bulkUpdateStatus}
                            onExport={() => services.handleExportData(data.selectedIds.size > 0 ? data.crmData.filter(l => data.selectedIds.has(l.id)) : data.processedData)}
                        />
                    )}

                    {auth.activeTab === 'hunter' && (
                        <window.HunterTab
                            keywords={services.keywords}
                            setKeywords={services.setKeywords}
                            searchDepth={services.searchDepth}
                            setSearchDepth={services.setSearchDepth}
                            searchLocation={auth.searchLocation}
                            setSearchLocation={auth.setSearchLocation}
                            isScanning={services.isScanning}
                            startScan={services.startScan}
                            stopScan={services.stopScan}
                            progress={services.hunterProgress}
                            logs={services.hunterLogs}
                            logsEndRef={services.hunterLogsEndRef}
                            leads={leads}
                            hunterFilterType={hunterFilterType}
                            setHunterFilterType={setHunterFilterType}
                            selectedIds={data.selectedIds}
                            bulkAddNotViable={services.bulkAddNotViable}
                            setShowBulkModal={services.setShowBulkModal}
                            processedHunterLeads={processedHunterLeads}
                            toggleSelectAll={data.toggleSelectAll}
                            toggleSelection={data.toggleSelection}
                            setHunterSort={setHunterSort}
                            addToCrm={actions.addToCrm}
                        />
                    )}

                    {auth.activeTab === 'crm' && (
                        <window.CrmTab
                            crmData={data.crmData}
                            filters={data.filters}
                            setFilters={data.setFilters}
                            selectedIds={data.selectedIds}
                            setShowBulkModal={services.setShowBulkModal}
                            activeTab={auth.activeTab}
                            fixAllTrafficData={services.fixAllTrafficData}
                            onBulkCheck={services.handleBulkReplyCheck}
                            isCheckingBulk={services.isCheckingBulk}
                            paginatedItems={data.getPaginatedData()}
                            selectedCount={data.selectedIds.size}
                            toggleSelectAll={data.toggleSelectAll}
                            toggleSelection={data.toggleSelection}
                            handleSort={data.handleSort}
                            sortConfig={data.sortConfig}
                            itemsPerPage={data.itemsPerPage}
                            setItemsPerPage={data.setItemsPerPage}
                            selectAllFiltered={data.selectAllFiltered}
                            clearSelection={data.clearSelection}
                            editingRowId={actions.editingRowId}
                            editFormData={actions.editFormData}
                            handleEditChange={actions.handleEditChange}
                            handleEditSave={actions.handleEditSave}
                            handleEditCancel={actions.handleEditCancel}
                            handleEditClick={actions.handleEditClick}
                            setHistoryModalLead={setHistoryModalLead}
                            openMailModal={services.openMailModal}
                            openPromotionModal={services.openPromotionModal}
                            currentPage={data.currentPage}
                            totalPages={data.totalPages}
                            setCurrentPage={data.setCurrentPage}
                            totalRecords={data.processedData.length}
                            emailMap={data.emailMap}
                            getStageInfo={actions.getStageInfo}
                            enrichDatabase={services.enrichDatabase}
                            isEnriching={services.isEnriching}
                            setShowImportModal={setShowImportModal}
                            bulkUpdateStatus={services.bulkUpdateStatus}
                            onExport={() => services.handleExportData(data.selectedIds.size > 0 ? data.crmData.filter(l => data.selectedIds.has(l.id)) : data.processedData)}
                            startAutoFollowup={services.startAutoFollowup}
                            stopAutoFollowup={services.stopAutoFollowup}
                        />
                    )}

                    {auth.activeTab === 'settings' && (
                        <window.SettingsTab
                            settings={auth.settings}
                            handleSettingChange={auth.handleSettingChange}
                            saveSettingsToCloud={auth.saveSettingsToCloud}
                            showSignatureHtml={auth.showSignatureHtml}
                            setShowSignatureHtml={auth.setShowSignatureHtml}
                            fixHtmlCode={auth.fixHtmlCode}
                            fixAllTrafficData={services.fixAllTrafficData}
                            activeTemplateLang={auth.activeTemplateLang}
                            setActiveTemplateLang={auth.setActiveTemplateLang}
                            activeTemplateIndex={auth.activeTemplateIndex}
                            setActiveTemplateIndex={auth.setActiveTemplateIndex}
                            updateWorkflowStep={auth.updateWorkflowStep}
                            updatePromotionTemplate={auth.updatePromotionTemplate}
                            openPromotionModal={services.openPromotionModal}
                            runAutoHunterScan={services.runAutoHunterScan}
                            stopAutoHunterScan={services.stopAutoHunterScan}
                            isHunterRunning={services.isHunterRunning}
                        />
                    )}
                </div>
            </div>

            {services.showEnrichModal && <window.EnrichModal isEnriching={services.isEnriching} enrichProgress={services.enrichProgress} enrichLogs={services.enrichLogs} close={() => services.setShowEnrichModal(false)} />}
            {services.showBulkModal && <window.BulkModal isBulkSending={services.isBulkSending} bulkProgress={services.bulkProgress} selectedCount={data.selectedIds.size} bulkConfig={services.bulkConfig} setBulkConfig={services.setBulkConfig} activeTab={auth.activeTab} settings={auth.settings} executeBulkSend={services.executeBulkSend} executeBulkPromotion={services.executeBulkPromotion} close={() => services.setShowBulkModal(false)} setShowBulkModal={services.setShowBulkModal} />}
            <window.MailModal selectedLead={services.selectedLead} setSelectedLead={services.setSelectedLead} handleSendMail={services.handleSendMail} isSending={services.isSending} />
            <window.ImportModal isOpen={showImportModal} onClose={() => setShowImportModal(false)} crmData={data.crmData} dbInstance={auth.dbInstance} isDbConnected={auth.isDbConnected} />
            <window.HistoryModal historyModalLead={historyModalLead} setHistoryModalLead={setHistoryModalLead} checkGmailReply={actions.checkGmailReply} isCheckingReply={actions.isCheckingReply} replyCheckResult={actions.replyCheckResult} onAddNote={actions.handleAddNote} onDeleteNote={actions.handleDeleteNote} onUpdateNote={actions.handleUpdateNote} />
        </div>
    );
};

window.LeadHunter = LeadHunter;