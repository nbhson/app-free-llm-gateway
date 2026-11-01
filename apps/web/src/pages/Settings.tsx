import { useCallback, useState } from "react";
import { useSettingsForm } from "../features/settings/hooks/useSettingsForm";
import { useEmbeddingCheck } from "../features/settings/hooks/useEmbeddingCheck";
import { useCacheStats } from "../features/settings/hooks/useCacheStats";
import { useCompressionPreview } from "../features/settings/hooks/useCompressionPreview";
import { getMasterKey } from "../features/settings/lib/helpers";
import { SettingsHeader } from "../features/settings/components/SettingsHeader";
import { CacheStatsBanner } from "../features/settings/components/CacheStatsBanner";
import { SemanticCacheSection } from "../features/settings/components/sections/SemanticCacheSection";
import { RoutingSection } from "../features/settings/components/sections/RoutingSection";
import { ReliabilitySection } from "../features/settings/components/sections/ReliabilitySection";
import { WebToolsSection } from "../features/settings/components/sections/WebToolsSection";
import { AnalyticsSection } from "../features/settings/components/sections/AnalyticsSection";
import { TiersSection } from "../features/settings/components/sections/TiersSection";
import { DangerZone } from "../features/settings/components/DangerZone";
import { NoteBox } from "../features/settings/components/NoteBox";
import { EnvSnippetPanel } from "../features/settings/components/EnvSnippetPanel";
import { DirtyBar } from "../features/settings/components/DirtyBar";

export default function Settings() {
  const [search, setSearch] = useState("");

  const s = useSettingsForm();
  const {
    form, isModified, diffKeys, update, collapsed, setCollapsed,
    setApplyMsg, applyMsgTimeoutRef,
  } = s;
  const emb = useEmbeddingCheck(form);
  const preview = useCompressionPreview(form);
  const cache = useCacheStats();

  const handleToggleSection = useCallback((id: string) => {
    setCollapsed((prev) => ({ ...prev, [id]: !prev[id] }));
  }, [setCollapsed]);

  const handleClearCache = useCallback(() => {
    return cache.handleClearCache(
      (msg) => setApplyMsg(msg),
      (ms) => {
        if (applyMsgTimeoutRef.current) window.clearTimeout(applyMsgTimeoutRef.current);
        applyMsgTimeoutRef.current = window.setTimeout(() => setApplyMsg(null), ms);
      }
    );
  }, [cache.handleClearCache, setApplyMsg, applyMsgTimeoutRef]);

  const handleModelHealthClear = useCallback(async () => {
    if (!confirm("Clear persisted model health (model-health.json)? This removes all 404/410 marks.")) return;
    const key = getMasterKey();
    try {
      const r = await fetch("/api/models/health/persisted", { method: "DELETE", headers: { Authorization: `Bearer ${key}` } });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setApplyMsg("✅ Model health cleared");
    } catch (e) {
      setApplyMsg(`❌ ${(e as Error).message}`);
    } finally {
      if (applyMsgTimeoutRef.current) window.clearTimeout(applyMsgTimeoutRef.current);
      applyMsgTimeoutRef.current = window.setTimeout(() => setApplyMsg(null), 3000);
    }
  }, [setApplyMsg, applyMsgTimeoutRef]);

  return (
    <div className="space-y-6 pb-20">
      {/* Header */}
      <SettingsHeader
        source={s.source}
        lastSaved={s.lastSaved}
        diffCount={diffKeys.length}
        search={search}
        onSearchChange={setSearch}
        fileInputRef={s.fileInputRef}
        onPreset={s.handlePreset}
        onExportJson={s.handleExportJson}
        onImportJson={s.handleImportJson}
        onPickFile={() => s.fileInputRef.current?.click()}
        onReset={s.handleReset}
        onSave={s.handleSave}
        isDirty={s.isDirty}
        saved={s.saved}
        validationErrors={s.validationErrors}
        applying={s.applying}
        onApplyToServer={s.handleApplyToServer}
        applyMsg={s.applyMsg}
      />

      {/* Cache live stats banner - pretty */}
      <CacheStatsBanner
        cacheStats={cache.cacheStats}
        cacheLoading={cache.cacheLoading}
        cacheError={cache.cacheError}
        clearingCache={cache.clearingCache}
        onRefresh={cache.fetchCacheStats}
        onClear={handleClearCache}
      />

      <div className="grid grid-cols-1 gap-6">
        {/* Single column — all sections stacked */}
        <div className="space-y-6">
          <SemanticCacheSection
            form={form}
            update={update}
            isModified={isModified}
            onResetSection={() => s.handleResetSection(["SEMANTIC_CACHE_ENABLED","SEMANTIC_THRESHOLD","CACHE_TTL_S","EMBEDDING_MODEL","EMBEDDING_FALLBACKS","SEMANTIC_CACHE_MAX_MEM","SEMANTIC_CACHE_SCAN_CAP"])}
            search={search}
            collapsed={collapsed}
            onToggle={handleToggleSection}
            embStatus={emb.embStatus}
            setEmbStatus={emb.setEmbStatus}
            fallbackStatuses={emb.fallbackStatuses}
            setFallbackStatuses={emb.setFallbackStatuses}
            checkPrimary={emb.checkPrimary}
            checkFallbacks={emb.checkFallbacks}
          />

          <RoutingSection
            form={form}
            update={update}
            isModified={isModified}
            onResetSection={() => s.handleResetSection(["COMPRESSION_ENABLED","COMPRESSION_MAX_TOKENS","COST_ROUTING_ENABLED","COST_WEIGHT","LATENCY_WEIGHT","HEADROOM_WEIGHT","SUCCESS_WEIGHT"])}
            search={search}
            collapsed={collapsed}
            onToggle={handleToggleSection}
            costPreview={s.costPreview}
            previewInput={preview.previewInput}
            setPreviewInput={preview.setPreviewInput}
            previewResult={preview.previewResult}
            previewLoading={preview.previewLoading}
            previewError={preview.previewError}
            onPreview={preview.handleCompressionPreview}
          />
        </div>

        {/* Right col */}
        <div className="space-y-6">
          <ReliabilitySection
            form={form}
            update={update}
            isModified={isModified}
            onResetSection={() => s.handleResetSection(["PROVIDER_TIMEOUT_MS","PROVIDER_TIMEOUT_AUTO_MS","PROVIDER_TIMEOUT_REASONING_MS","PROVIDER_PARALLEL_AUTO","PROVIDER_PARALLEL_DEFAULT","CIRCUIT_BREAKER_THRESHOLD","CIRCUIT_BREAKER_COOLDOWN_MS"])}
            search={search}
            collapsed={collapsed}
            onToggle={handleToggleSection}
          />

          <WebToolsSection
            form={form}
            update={update}
            isModified={isModified}
            onResetSection={() => s.handleResetSection(["WEB_TOOLS_ENABLED","WEB_SEARCH_PROVIDER","WEB_FETCH_TIMEOUT_MS","WEB_FETCH_MAX_BYTES","WEB_SEARCH_MAX_RESULTS","WEB_TOOLS_MAX_ITERATIONS","WEB_CACHE_TTL_S"])}
            search={search}
            collapsed={collapsed}
            onToggle={handleToggleSection}
          />

          <AnalyticsSection
            form={form}
            update={update}
            isModified={isModified}
            onResetSection={() => s.handleResetSection(["ANALYTICS_RETENTION_DAYS"])}
            search={search}
            collapsed={collapsed}
            onToggle={handleToggleSection}
          />

          <TiersSection
            update={update}
            isModified={isModified}
            onResetSection={() => s.handleResetSection(["FALLBACK_TIERS"])}
            search={search}
            collapsed={collapsed}
            onToggle={handleToggleSection}
            tiersText={s.tiersText}
            setTiersText={s.setTiersText}
            tiersError={s.tiersError}
            setTiersError={s.setTiersError}
            newProvider={s.newProvider}
            setNewProvider={s.setNewProvider}
            onTiersSave={s.handleTiersSave}
            onTiersAddProvider={s.handleTiersAddProvider}
          />

          <DangerZone
            clearingCache={cache.clearingCache}
            onClearCache={handleClearCache}
            onModelHealthClear={handleModelHealthClear}
            onReset={s.handleReset}
          />

          <NoteBox />
        </div>
      </div>

      <EnvSnippetPanel
        envSnippet={s.envSnippet}
        showSnippetDiffOnly={s.showSnippetDiffOnly}
        onToggleDiffOnly={s.setShowSnippetDiffOnly}
        diffCount={diffKeys.length}
        copiedEnv={s.copiedEnv}
        copiedDiff={s.copiedDiff}
        onCopyEnv={s.handleCopyEnv}
        onCopyDiff={s.handleCopyDiff}
        onDownload={s.handleDownload}
      />

      {s.isDirty && (
        <DirtyBar
          diffCount={diffKeys.length}
          invalidCount={s.validationErrors.length}
          applying={s.applying}
          onSave={s.handleSave}
          onApply={s.handleApplyToServer}
          onDismiss={() => s.setIsDirty(false)}
        />
      )}
    </div>
  );
}
