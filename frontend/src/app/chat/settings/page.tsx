"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { auth, userSettings, providers } from "@/lib/api";
import { useToast } from "@/components/toast";

type ProviderTemplate = {
  name: string;
  base_url: string;
  icon: string;
  hint: string;
};

type ProviderEntry = {
  id: string;
  provider: string;
  name: string;
  base_url: string;
  api_key_masked: string;
  models: string[];
  is_enabled: boolean;
  created_at: string;
};

type ModelEntry = {
  id: string;
  provider: string;
  name: string;
};

/* ---------- small reusable spinner ---------- */
function Spinner({ size = 16 }: { size?: number }) {
  return (
    <svg className="animate-spin" width={size} height={size} viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

/* ================================================
   Provider Card
   ================================================ */
function ProviderCard({
  entry,
  templateIcon,
  onToggle,
  onRefresh,
  onUpdate,
  onDelete,
}: {
  entry: ProviderEntry;
  templateIcon?: string;
  onToggle: () => void;
  onRefresh: () => void;
  onUpdate: (data: { api_key?: string; base_url?: string; name?: string }) => Promise<void>;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editKey, setEditKey] = useState("");
  const [editName, setEditName] = useState(entry.name);
  const [editBaseUrl, setEditBaseUrl] = useState(entry.base_url);
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      const data: { api_key?: string; base_url?: string; name?: string } = {};
      if (editKey) data.api_key = editKey;
      if (editName !== entry.name) data.name = editName;
      if (editBaseUrl !== entry.base_url) data.base_url = editBaseUrl;
      await onUpdate(data);
      setEditing(false);
      setEditKey("");
    } finally {
      setSaving(false);
    }
  }

  async function handleRefresh() {
    setRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <div
      className="t-card rounded-lg p-4 transition-colors"
      style={{ opacity: entry.is_enabled ? 1 : 0.6 }}
    >
      {/* Header row */}
      <div className="flex items-center justify-between gap-3 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className="material-symbols-outlined text-[20px]"
            style={{ color: "var(--accent)" }}
          >
            {templateIcon || "smart_toy"}
          </span>
          <span className="text-[14px] font-semibold truncate">{entry.name}</span>
        </div>
        {/* Toggle */}
        <button
          onClick={onToggle}
          className="relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full transition-colors duration-200 ease-in-out focus:outline-none"
          style={{
            background: entry.is_enabled ? "var(--accent)" : "var(--bg-emphasis)",
          }}
          title={entry.is_enabled ? "Disable provider" : "Enable provider"}
        >
          <span
            className="inline-block h-4 w-4 rounded-full shadow transform transition-transform duration-200 ease-in-out"
            style={{
              background: "#fff",
              marginTop: 2,
              transform: entry.is_enabled ? "translateX(18px)" : "translateX(2px)",
            }}
          />
        </button>
      </div>

      {/* Info */}
      <div className="text-[12px] mb-1 font-[family-name:var(--font-mono)]" style={{ color: "var(--fg-secondary)" }}>
        API Key: {showKey ? entry.api_key_masked : entry.api_key_masked}
      </div>

      {/* Models */}
      {entry.models && entry.models.length > 0 ? (
        <div className="flex flex-wrap gap-1 mt-2">
          {entry.models.map((m) => (
            <span
              key={m}
              className="font-[family-name:var(--font-mono)] text-[10px] px-2 py-0.5 rounded-full border"
              style={{ background: "var(--bg-emphasis)", borderColor: "var(--border-hover)", color: "var(--fg-secondary)" }}
            >
              {m}
            </span>
          ))}
        </div>
      ) : (
        <div className="flex items-center gap-1 mt-2 text-[11px]" style={{ color: "var(--error)" }}>
          <span className="material-symbols-outlined text-[14px]">warning</span>
          No models found — check your API key
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 mt-3 pt-3" style={{ borderTop: "1px solid var(--border)" }}>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="t-btn-ghost text-[11px] px-2 py-1 rounded flex items-center gap-1 transition-colors disabled:opacity-50"
        >
          {refreshing ? <Spinner size={12} /> : <span className="material-symbols-outlined text-[14px]">refresh</span>}
          Refresh Models
        </button>
        <button
          onClick={() => { setEditing(!editing); setConfirmDelete(false); }}
          className="t-btn-ghost text-[11px] px-2 py-1 rounded flex items-center gap-1 transition-colors"
        >
          <span className="material-symbols-outlined text-[14px]">edit</span>
          Edit
        </button>
        {!confirmDelete ? (
          <button
            onClick={() => { setConfirmDelete(true); setEditing(false); }}
            className="t-btn-ghost text-[11px] px-2 py-1 rounded flex items-center gap-1 transition-colors hover:text-[#ffb4ab]"
          >
            <span className="material-symbols-outlined text-[14px]">delete</span>
            Remove
          </button>
        ) : (
          <div className="flex items-center gap-1 ml-auto">
            <span className="text-[11px]" style={{ color: "var(--fg-muted)" }}>Remove?</span>
            <button
              onClick={onDelete}
              className="text-[11px] px-2 py-1 rounded font-medium transition-colors"
              style={{ background: "var(--error)", color: "#fff" }}
            >
              Yes
            </button>
            <button
              onClick={() => setConfirmDelete(false)}
              className="t-btn-ghost text-[11px] px-2 py-1 rounded transition-colors"
            >
              No
            </button>
          </div>
        )}
      </div>

      {/* Inline edit form */}
      {editing && (
        <div className="mt-3 pt-3 space-y-3" style={{ borderTop: "1px solid var(--border)" }}>
          <div>
            <label className="font-[family-name:var(--font-mono)] text-[10px] tracking-[0.05em] font-bold uppercase block mb-1" style={{ color: "var(--fg-secondary)" }}>
              Display Name
            </label>
            <input
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              className="t-input w-full rounded px-3 py-2 text-[13px]"
            />
          </div>
          <div>
            <label className="font-[family-name:var(--font-mono)] text-[10px] tracking-[0.05em] font-bold uppercase block mb-1" style={{ color: "var(--fg-secondary)" }}>
              New API Key (leave blank to keep current)
            </label>
            <div className="relative">
              <input
                type={showKey ? "text" : "password"}
                value={editKey}
                onChange={(e) => setEditKey(e.target.value)}
                className="t-input w-full rounded px-3 py-2 pr-9 text-[13px] font-[family-name:var(--font-mono)]"
                placeholder="Enter new API key"
              />
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                className="absolute right-2 top-1/2 -translate-y-1/2"
                style={{ color: "var(--fg-muted)" }}
              >
                <span className="material-symbols-outlined text-[16px]">
                  {showKey ? "visibility_off" : "visibility"}
                </span>
              </button>
            </div>
          </div>
          <div>
            <label className="font-[family-name:var(--font-mono)] text-[10px] tracking-[0.05em] font-bold uppercase block mb-1" style={{ color: "var(--fg-secondary)" }}>
              Base URL
            </label>
            <input
              value={editBaseUrl}
              onChange={(e) => setEditBaseUrl(e.target.value)}
              className="t-input w-full rounded px-3 py-2 text-[13px] font-[family-name:var(--font-mono)]"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleSave}
              disabled={saving}
              className="t-btn text-[12px] font-medium px-3 py-1.5 rounded flex items-center gap-1 disabled:opacity-50"
            >
              {saving ? <Spinner size={12} /> : null}
              {saving ? "Saving..." : "Save Changes"}
            </button>
            <button
              onClick={() => { setEditing(false); setEditKey(""); }}
              className="t-btn-ghost text-[12px] px-3 py-1.5 rounded transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ================================================
   Add Provider Form
   ================================================ */
function AddProviderForm({
  templateKey,
  template,
  onAdd,
  onCancel,
}: {
  templateKey: string;
  template: ProviderTemplate;
  onAdd: (data: { provider: string; api_key: string; base_url?: string; name?: string }) => Promise<void>;
  onCancel: () => void;
}) {
  const [apiKey, setApiKey] = useState("");
  const [customName, setCustomName] = useState("");
  const [baseUrl, setBaseUrl] = useState(template.base_url || "");
  const [showKey, setShowKey] = useState(false);
  const [adding, setAdding] = useState(false);
  const isCustom = templateKey === "custom";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setAdding(true);
    try {
      await onAdd({
        provider: templateKey,
        api_key: apiKey,
        ...(customName ? { name: customName } : {}),
        ...(isCustom || baseUrl !== template.base_url ? { base_url: baseUrl } : {}),
      });
    } finally {
      setAdding(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="t-card rounded-lg p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-[20px]" style={{ color: "var(--accent)" }}>
            {template.icon || "smart_toy"}
          </span>
          <span className="text-[14px] font-semibold">Connect {template.name}</span>
        </div>
        <button type="button" onClick={onCancel} style={{ color: "var(--fg-muted)" }}>
          <span className="material-symbols-outlined text-[18px]">close</span>
        </button>
      </div>

      <div>
        <label className="font-[family-name:var(--font-mono)] text-[10px] tracking-[0.05em] font-bold uppercase block mb-1" style={{ color: "var(--fg-secondary)" }}>
          API Key
        </label>
        <div className="relative">
          <input
            type={showKey ? "text" : "password"}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            className="t-input w-full rounded px-3 py-2 pr-9 text-[13px] font-[family-name:var(--font-mono)]"
            placeholder={template.hint || "Enter your API key"}
            required
            autoFocus
          />
          <button
            type="button"
            onClick={() => setShowKey(!showKey)}
            className="absolute right-2 top-1/2 -translate-y-1/2"
            style={{ color: "var(--fg-muted)" }}
          >
            <span className="material-symbols-outlined text-[16px]">
              {showKey ? "visibility_off" : "visibility"}
            </span>
          </button>
        </div>
      </div>

      {isCustom && (
        <div>
          <label className="font-[family-name:var(--font-mono)] text-[10px] tracking-[0.05em] font-bold uppercase block mb-1" style={{ color: "var(--fg-secondary)" }}>
            Base URL
          </label>
          <input
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            className="t-input w-full rounded px-3 py-2 text-[13px] font-[family-name:var(--font-mono)]"
            placeholder="https://api.example.com/v1"
            required
          />
        </div>
      )}

      <div>
        <label className="font-[family-name:var(--font-mono)] text-[10px] tracking-[0.05em] font-bold uppercase block mb-1" style={{ color: "var(--fg-secondary)" }}>
          Display Name <span className="normal-case font-normal" style={{ color: "var(--fg-muted)" }}>(optional)</span>
        </label>
        <input
          value={customName}
          onChange={(e) => setCustomName(e.target.value)}
          className="t-input w-full rounded px-3 py-2 text-[13px]"
          placeholder={template.name}
        />
      </div>

      <div className="flex gap-2 pt-1">
        <button
          type="submit"
          disabled={adding || !apiKey}
          className="t-btn text-[13px] font-medium px-4 py-2 rounded flex items-center gap-2 disabled:opacity-50"
        >
          {adding ? <Spinner size={14} /> : <span className="material-symbols-outlined text-[16px]">link</span>}
          {adding ? "Connecting..." : "Connect"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="t-btn-ghost text-[13px] px-4 py-2 rounded transition-colors"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

/* ================================================
   Main Settings Page
   ================================================ */
export default function SettingsPage() {
  const { toast } = useToast();

  /* ---- auth ---- */
  const [email, setEmail] = useState("");

  /* ---- user settings ---- */
  const [displayName, setDisplayName] = useState("");
  const [defaultModel, setDefaultModel] = useState("");
  const [defaultTemp, setDefaultTemp] = useState(0.7);
  const [defaultPrompt, setDefaultPrompt] = useState("");
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [settingsSaving, setSettingsSaving] = useState(false);

  /* ---- models ---- */
  const [allModels, setAllModels] = useState<ModelEntry[]>([]);

  /* ---- providers ---- */
  const [templates, setTemplates] = useState<Record<string, ProviderTemplate>>({});
  const [providerList, setProviderList] = useState<ProviderEntry[]>([]);
  const [providersLoading, setProvidersLoading] = useState(true);
  const [addingProvider, setAddingProvider] = useState<string | null>(null);

  /* ---- load everything ---- */
  const loadProviders = useCallback(() => {
    providers.list()
      .then(setProviderList)
      .catch(() => toast("Failed to load providers", "error"))
      .finally(() => setProvidersLoading(false));
  }, [toast]);

  const loadModels = useCallback(() => {
    providers.allModels()
      .then(setAllModels)
      .catch(() => {});
  }, []);

  useEffect(() => {
    auth.me()
      .then((u: { email: string }) => setEmail(u.email))
      .catch(() => {});

    userSettings.get()
      .then((s: { display_name?: string; default_model?: string; default_temperature?: number; default_system_prompt?: string }) => {
        if (s.display_name) setDisplayName(s.display_name);
        if (s.default_model) setDefaultModel(s.default_model);
        if (s.default_temperature !== undefined) setDefaultTemp(s.default_temperature);
        if (s.default_system_prompt) setDefaultPrompt(s.default_system_prompt);
      })
      .catch(() => toast("Failed to load settings", "error"))
      .finally(() => setSettingsLoading(false));

    providers.templates()
      .then(setTemplates)
      .catch(() => toast("Failed to load provider templates", "error"));

    loadProviders();
    loadModels();
  }, [toast, loadProviders, loadModels]);

  /* ---- save profile + chat defaults ---- */
  async function handleSaveSettings() {
    setSettingsSaving(true);
    try {
      await userSettings.update({
        display_name: displayName || undefined,
        default_model: defaultModel || undefined,
        default_temperature: defaultTemp,
        default_system_prompt: defaultPrompt || undefined,
      });
      toast("Settings saved", "success");
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "Failed to save settings", "error");
    } finally {
      setSettingsSaving(false);
    }
  }

  /* ---- provider actions ---- */
  async function handleAddProvider(data: { provider: string; api_key: string; base_url?: string; name?: string }) {
    try {
      await providers.add(data);
      toast("Provider connected", "success");
      setAddingProvider(null);
      loadProviders();
      loadModels();
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "Failed to add provider", "error");
      throw err; // re-throw so the form keeps the adding state
    }
  }

  async function handleToggle(entry: ProviderEntry) {
    try {
      await providers.update(entry.id, { is_enabled: !entry.is_enabled });
      toast(entry.is_enabled ? "Provider disabled" : "Provider enabled", "success");
      loadProviders();
      loadModels();
    } catch {
      toast("Failed to toggle provider", "error");
    }
  }

  async function handleRefresh(id: string) {
    try {
      await providers.refresh(id);
      toast("Models refreshed", "success");
      loadProviders();
      loadModels();
    } catch {
      toast("Failed to refresh models", "error");
    }
  }

  async function handleUpdateProvider(id: string, data: { api_key?: string; base_url?: string; name?: string }) {
    try {
      await providers.update(id, data);
      toast("Provider updated", "success");
      loadProviders();
      loadModels();
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "Failed to update provider", "error");
      throw err;
    }
  }

  async function handleDeleteProvider(id: string) {
    try {
      await providers.delete(id);
      toast("Provider removed", "success");
      loadProviders();
      loadModels();
    } catch {
      toast("Failed to remove provider", "error");
    }
  }

  /* ---- build icon map from templates ---- */
  const iconMap: Record<string, string> = {};
  for (const [key, tmpl] of Object.entries(templates)) {
    iconMap[key] = tmpl.icon;
  }

  /* ---- template keys for the grid ---- */
  const templateKeys = Object.keys(templates);

  if (settingsLoading) {
    return (
      <div className="flex-1 flex items-center justify-center" style={{ color: "var(--fg-muted)" }}>
        <div className="flex items-center gap-3">
          <Spinner size={20} />
          Loading settings...
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-[720px] mx-auto w-full px-6 py-8 flex flex-col gap-8">
        {/* Page header */}
        <div>
          <h1 className="text-[24px] font-semibold tracking-[-0.01em]">Settings</h1>
          <p className="text-[14px] mt-1" style={{ color: "var(--fg-secondary)" }}>
            Manage your profile, chat defaults, and connected AI providers.
          </p>
        </div>

        {/* ═══════════════════════════
            Section 1 — Profile
            ═══════════════════════════ */}
        <section>
          <div className="mb-4">
            <h2 className="text-[16px] font-semibold flex items-center gap-2">
              <span className="material-symbols-outlined text-[18px]" style={{ color: "var(--accent)" }}>person</span>
              Profile
            </h2>
            <p className="text-[12px] mt-0.5" style={{ color: "var(--fg-muted)" }}>
              Your identity in chat conversations.
            </p>
          </div>

          <div className="t-card rounded-lg p-4 space-y-4">
            <div>
              <label className="font-[family-name:var(--font-mono)] text-[10px] tracking-[0.05em] font-bold uppercase block mb-1" style={{ color: "var(--fg-secondary)" }}>
                Display Name
              </label>
              <input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="t-input w-full rounded px-3 py-2 text-[13px]"
                placeholder="How you appear in chat (optional)"
              />
            </div>
            <div>
              <label className="font-[family-name:var(--font-mono)] text-[10px] tracking-[0.05em] font-bold uppercase block mb-1" style={{ color: "var(--fg-secondary)" }}>
                Email
              </label>
              <input
                value={email}
                readOnly
                className="t-input w-full rounded px-3 py-2 text-[13px] cursor-not-allowed"
                style={{ opacity: 0.6 }}
              />
            </div>
          </div>
        </section>

        {/* ═══════════════════════════
            Section 2 — Chat Defaults
            ═══════════════════════════ */}
        <section>
          <div className="mb-4">
            <h2 className="text-[16px] font-semibold flex items-center gap-2">
              <span className="material-symbols-outlined text-[18px]" style={{ color: "var(--accent)" }}>tune</span>
              Chat Defaults
            </h2>
            <p className="text-[12px] mt-0.5" style={{ color: "var(--fg-muted)" }}>
              Default parameters for new conversations.
            </p>
          </div>

          <div className="t-card rounded-lg p-4 space-y-4">
            {/* Default model */}
            <div>
              <label className="font-[family-name:var(--font-mono)] text-[10px] tracking-[0.05em] font-bold uppercase block mb-1" style={{ color: "var(--fg-secondary)" }}>
                Default Model
              </label>
              <select
                value={defaultModel}
                onChange={(e) => setDefaultModel(e.target.value)}
                className="t-input w-full rounded px-3 py-2 text-[13px]"
              >
                <option value="">Select a model</option>
                {allModels.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name || m.id}{m.provider ? ` (${m.provider})` : ""}
                  </option>
                ))}
              </select>
            </div>

            {/* Temperature */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="font-[family-name:var(--font-mono)] text-[10px] tracking-[0.05em] font-bold uppercase" style={{ color: "var(--fg-secondary)" }}>
                  Default Temperature
                </label>
                <span
                  className="font-[family-name:var(--font-mono)] text-[12px] px-2 py-0.5 rounded"
                  style={{ background: "var(--bg-emphasis)", color: "var(--fg-secondary)" }}
                >
                  {defaultTemp.toFixed(1)}
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="2"
                step="0.1"
                value={defaultTemp}
                onChange={(e) => setDefaultTemp(parseFloat(e.target.value))}
                className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
                style={{
                  background: `linear-gradient(to right, var(--accent) 0%, var(--accent) ${(defaultTemp / 2) * 100}%, var(--bg-emphasis) ${(defaultTemp / 2) * 100}%, var(--bg-emphasis) 100%)`,
                }}
              />
              <div className="flex justify-between mt-1">
                <span className="text-[10px]" style={{ color: "var(--fg-muted)" }}>Precise (0)</span>
                <span className="text-[10px]" style={{ color: "var(--fg-muted)" }}>Creative (2)</span>
              </div>
            </div>

            {/* System prompt */}
            <div>
              <label className="font-[family-name:var(--font-mono)] text-[10px] tracking-[0.05em] font-bold uppercase block mb-1" style={{ color: "var(--fg-secondary)" }}>
                Default System Prompt
              </label>
              <textarea
                value={defaultPrompt}
                onChange={(e) => setDefaultPrompt(e.target.value)}
                className="t-input w-full rounded px-3 py-2 text-[13px] leading-[20px] resize-y min-h-[80px]"
                rows={3}
                placeholder="Instructions the model should follow by default..."
              />
            </div>
          </div>

          {/* Save button for profile + chat defaults */}
          <div className="mt-4 flex justify-end">
            <button
              onClick={handleSaveSettings}
              disabled={settingsSaving}
              className="t-btn text-[13px] font-medium px-5 py-2 rounded flex items-center gap-2 disabled:opacity-50"
            >
              {settingsSaving ? <Spinner size={14} /> : <span className="material-symbols-outlined text-[16px]">save</span>}
              {settingsSaving ? "Saving..." : "Save Settings"}
            </button>
          </div>
        </section>

        {/* ═══════════════════════════
            Section 3 — AI Providers
            ═══════════════════════════ */}
        <section>
          <div className="mb-4">
            <h2 className="text-[16px] font-semibold flex items-center gap-2">
              <span className="material-symbols-outlined text-[18px]" style={{ color: "var(--accent)" }}>hub</span>
              AI Providers
            </h2>
            <p className="text-[12px] mt-0.5" style={{ color: "var(--fg-muted)" }}>
              Connect external AI services. Your API keys are encrypted at rest.
            </p>
          </div>

          <div className="flex flex-col gap-3">
            {/* Local GPU card — always present */}
            <div className="t-card rounded-lg p-4">
              <div className="flex items-center justify-between gap-3 mb-1">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-[20px]" style={{ color: "var(--success)" }}>bolt</span>
                  <span className="text-[14px] font-semibold">Local GPU</span>
                </div>
                <span
                  className="font-[family-name:var(--font-mono)] text-[10px] tracking-[0.05em] font-bold uppercase px-2 py-0.5 rounded"
                  style={{ background: "var(--success)", color: "#fff" }}
                >
                  Always On
                </span>
              </div>
              <div className="text-[12px]" style={{ color: "var(--fg-secondary)" }}>
                Qwen3-14B via vLLM
              </div>
              <div className="text-[11px] mt-1" style={{ color: "var(--fg-muted)" }}>
                No API key needed
              </div>
            </div>

            {/* Connected providers */}
            {providersLoading ? (
              <div className="flex items-center justify-center py-6" style={{ color: "var(--fg-muted)" }}>
                <Spinner size={16} />
                <span className="ml-2 text-[13px]">Loading providers...</span>
              </div>
            ) : (
              providerList.map((entry) => (
                <ProviderCard
                  key={entry.id}
                  entry={entry}
                  templateIcon={iconMap[entry.provider]}
                  onToggle={() => handleToggle(entry)}
                  onRefresh={() => handleRefresh(entry.id)}
                  onUpdate={(data) => handleUpdateProvider(entry.id, data)}
                  onDelete={() => handleDeleteProvider(entry.id)}
                />
              ))
            )}

            {/* Add provider — template grid or form */}
            {addingProvider && templates[addingProvider] ? (
              <AddProviderForm
                templateKey={addingProvider}
                template={templates[addingProvider]}
                onAdd={handleAddProvider}
                onCancel={() => setAddingProvider(null)}
              />
            ) : (
              <div className="t-card rounded-lg p-4">
                <div className="mb-3">
                  <span className="text-[13px] font-semibold">Add a Provider</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {templateKeys.map((key) => {
                    const tmpl = templates[key];
                    return (
                      <button
                        key={key}
                        onClick={() => setAddingProvider(key)}
                        className="t-btn-ghost flex items-center gap-1.5 px-3 py-2 rounded-lg text-[12px] font-medium transition-colors border"
                        style={{ borderColor: "var(--border)" }}
                      >
                        <span className="material-symbols-outlined text-[16px]" style={{ color: "var(--accent)" }}>
                          {tmpl.icon || "smart_toy"}
                        </span>
                        {tmpl.name}
                      </button>
                    );
                  })}
                  {/* Custom option if not already in templates */}
                  {!templates["custom"] && (
                    <button
                      onClick={() => {
                        setTemplates((prev) => ({
                          ...prev,
                          custom: { name: "Custom", base_url: "", icon: "settings_ethernet", hint: "Enter your API key" },
                        }));
                        setAddingProvider("custom");
                      }}
                      className="t-btn-ghost flex items-center gap-1.5 px-3 py-2 rounded-lg text-[12px] font-medium transition-colors border"
                      style={{ borderColor: "var(--border)" }}
                    >
                      <span className="material-symbols-outlined text-[16px]" style={{ color: "var(--fg-muted)" }}>
                        settings_ethernet
                      </span>
                      Custom
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </section>

        {/* ═══════════════════════════
            Section 4 — Back to Chat
            ═══════════════════════════ */}
        <div className="pb-4">
          <Link
            href="/chat"
            className="t-btn-ghost inline-flex items-center gap-2 text-[13px] px-4 py-2 rounded-lg transition-colors"
          >
            <span className="material-symbols-outlined text-[16px]">arrow_back</span>
            Back to Chat
          </Link>
        </div>
      </div>
    </div>
  );
}
