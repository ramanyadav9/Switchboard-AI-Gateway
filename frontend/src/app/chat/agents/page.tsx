"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { agents, keys } from "@/lib/api";
import { useToast } from "@/components/toast";

type Agent = {
  id: string;
  name: string;
  hostname: string;
  os: string;
  workspace: string;
  status: "pending" | "online" | "offline";
  tools?: string[];
  last_seen?: string;
  created_at: string;
};

type ApiKey = {
  id: string;
  prefix: string;
  name: string;
};

type CommandEntry = {
  command: string;
  output: string;
  exit_code: number;
};

type FileEntry = {
  name: string;
  type: "file" | "directory";
  size?: number;
};

function Spinner({ size = "h-3.5 w-3.5" }: { size?: string }) {
  return (
    <svg className={`animate-spin ${size}`} viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

function StatusDot({ status }: { status: Agent["status"] }) {
  const colors: Record<Agent["status"], string> = {
    pending: "#eab308",
    online: "#22c55e",
    offline: "#6b7280",
  };
  return (
    <span
      className="inline-block w-2 h-2 rounded-full shrink-0"
      style={{ background: colors[status] }}
    />
  );
}

function osIcon(os: string): string {
  const lower = (os || "").toLowerCase();
  if (lower.includes("linux")) return "computer";
  if (lower.includes("darwin") || lower.includes("macos") || lower.includes("mac")) return "laptop_mac";
  if (lower.includes("windows") || lower.includes("win")) return "desktop_windows";
  return "devices";
}

function relativeTime(iso?: string): string {
  if (!iso) return "Never";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

export default function AgentsPage() {
  const [agentList, setAgentList] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [apiKeyLoading, setApiKeyLoading] = useState(true);
  const [copiedInstall, setCopiedInstall] = useState(false);
  const [copiedKey, setCopiedKey] = useState(false);
  const [approvedToken, setApprovedToken] = useState<{ agentName: string; token: string } | null>(null);
  const [copiedToken, setCopiedToken] = useState(false);

  // Terminal state per agent
  const [terminalAgentId, setTerminalAgentId] = useState<string | null>(null);
  const [terminalInput, setTerminalInput] = useState("");
  const [terminalHistory, setTerminalHistory] = useState<Record<string, CommandEntry[]>>({});
  const [terminalRunning, setTerminalRunning] = useState(false);
  const terminalInputRef = useRef<HTMLInputElement>(null);
  const terminalOutputRef = useRef<HTMLDivElement>(null);

  // File browser state per agent
  const [fileAgentId, setFileAgentId] = useState<string | null>(null);
  const [filePath, setFilePath] = useState<string[]>([]);
  const [fileEntries, setFileEntries] = useState<FileEntry[]>([]);
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [fileContentName, setFileContentName] = useState<string | null>(null);
  const [fileLoading, setFileLoading] = useState(false);

  const { toast } = useToast();

  const loadAgents = useCallback(() => {
    agents
      .list()
      .then((data: Agent[]) => setAgentList(Array.isArray(data) ? data : []))
      .catch(() => toast("Failed to load agents", "error"))
      .finally(() => setLoading(false));
  }, [toast]);

  const loadApiKey = useCallback(() => {
    keys
      .list()
      .then((data: ApiKey[]) => {
        const list = Array.isArray(data) ? data : [];
        if (list.length > 0) {
          setApiKey(list[0].prefix);
        } else {
          setApiKey(null);
        }
      })
      .catch(() => setApiKey(null))
      .finally(() => setApiKeyLoading(false));
  }, []);

  useEffect(() => {
    loadAgents();
    loadApiKey();
  }, [loadAgents, loadApiKey]);

  // Auto-refresh every 10 seconds
  useEffect(() => {
    const interval = setInterval(loadAgents, 10000);
    return () => clearInterval(interval);
  }, [loadAgents]);

  async function handleApprove(agent: Agent) {
    try {
      const result = await agents.approve(agent.id);
      if (result.device_token) {
        setApprovedToken({ agentName: agent.name || agent.hostname, token: result.device_token });
      }
      toast("Device approved", "success");
      loadAgents();
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "Failed to approve agent", "error");
    }
  }

  async function handleReject(id: string) {
    if (!confirm("Reject and remove this device?")) return;
    try {
      await agents.disconnect(id);
      toast("Device rejected", "success");
      loadAgents();
    } catch {
      toast("Failed to reject device", "error");
    }
  }

  async function handleDisconnect(id: string) {
    if (!confirm("Disconnect this agent? It will need to be re-approved to reconnect.")) return;
    try {
      await agents.disconnect(id);
      toast("Agent disconnected", "success");
      if (terminalAgentId === id) setTerminalAgentId(null);
      if (fileAgentId === id) setFileAgentId(null);
      loadAgents();
    } catch {
      toast("Failed to disconnect agent", "error");
    }
  }

  // Terminal
  function toggleTerminal(agentId: string) {
    if (terminalAgentId === agentId) {
      setTerminalAgentId(null);
    } else {
      setTerminalAgentId(agentId);
      setFileAgentId(null);
      setFileContent(null);
      setFileContentName(null);
      setTimeout(() => terminalInputRef.current?.focus(), 100);
    }
  }

  async function handleTerminalSubmit(agentId: string, e: React.FormEvent) {
    e.preventDefault();
    const cmd = terminalInput.trim();
    if (!cmd || terminalRunning) return;
    setTerminalRunning(true);
    setTerminalInput("");
    try {
      const result = await agents.exec(agentId, "bash", { command: cmd });
      const entry: CommandEntry = {
        command: cmd,
        output: result.output || result.stdout || "",
        exit_code: result.exit_code ?? result.returncode ?? 0,
      };
      setTerminalHistory((prev) => ({
        ...prev,
        [agentId]: [...(prev[agentId] || []), entry],
      }));
      setTimeout(() => terminalOutputRef.current?.scrollTo(0, terminalOutputRef.current.scrollHeight), 50);
    } catch (err: unknown) {
      const entry: CommandEntry = {
        command: cmd,
        output: err instanceof Error ? err.message : "Command failed",
        exit_code: 1,
      };
      setTerminalHistory((prev) => ({
        ...prev,
        [agentId]: [...(prev[agentId] || []), entry],
      }));
    } finally {
      setTerminalRunning(false);
      terminalInputRef.current?.focus();
    }
  }

  // File browser
  async function openFileBrowser(agentId: string) {
    if (fileAgentId === agentId) {
      setFileAgentId(null);
      return;
    }
    setFileAgentId(agentId);
    setTerminalAgentId(null);
    setFilePath([]);
    setFileContent(null);
    setFileContentName(null);
    setFileLoading(true);
    try {
      const result = await agents.exec(agentId, "ls", {});
      setFileEntries(Array.isArray(result.entries) ? result.entries : Array.isArray(result) ? result : []);
    } catch {
      toast("Failed to list files", "error");
      setFileEntries([]);
    } finally {
      setFileLoading(false);
    }
  }

  async function navigateDir(agentId: string, dirName: string) {
    const newPath = [...filePath, dirName];
    setFileLoading(true);
    setFileContent(null);
    setFileContentName(null);
    try {
      const result = await agents.exec(agentId, "ls", { path: newPath.join("/") });
      setFileEntries(Array.isArray(result.entries) ? result.entries : Array.isArray(result) ? result : []);
      setFilePath(newPath);
    } catch {
      toast("Failed to list directory", "error");
    } finally {
      setFileLoading(false);
    }
  }

  async function navigateToBreadcrumb(agentId: string, index: number) {
    const newPath = filePath.slice(0, index);
    setFileLoading(true);
    setFileContent(null);
    setFileContentName(null);
    try {
      const pathStr = newPath.length > 0 ? newPath.join("/") : undefined;
      const result = await agents.exec(agentId, "ls", pathStr ? { path: pathStr } : {});
      setFileEntries(Array.isArray(result.entries) ? result.entries : Array.isArray(result) ? result : []);
      setFilePath(newPath);
    } catch {
      toast("Failed to navigate", "error");
    } finally {
      setFileLoading(false);
    }
  }

  async function openFile(agentId: string, fileName: string) {
    setFileLoading(true);
    try {
      const fullPath = [...filePath, fileName].join("/");
      const result = await agents.exec(agentId, "read_file", { path: fullPath });
      setFileContent(result.content || result.text || JSON.stringify(result, null, 2));
      setFileContentName(fileName);
    } catch {
      toast("Failed to read file", "error");
    } finally {
      setFileLoading(false);
    }
  }

  function copyText(text: string, setter: (v: boolean) => void) {
    navigator.clipboard.writeText(text).then(() => {
      setter(true);
      setTimeout(() => setter(false), 2000);
    }).catch(() => toast("Failed to copy", "error"));
  }

  const pendingAgents = agentList.filter((a) => a.status === "pending");
  const onlineAgents = agentList.filter((a) => a.status === "online");
  const offlineAgents = agentList.filter((a) => a.status === "offline");
  const hasAnyAgents = agentList.length > 0;

  const serverUrl = typeof window !== "undefined" ? window.location.origin : "";
  const installCmd = `curl -fsSL ${serverUrl}/api/install | bash`;

  return (
    <div className="max-w-[1280px] mx-auto w-full flex flex-col gap-4">
      {/* Page Header */}
      <div>
        <h2 className="text-[30px] leading-[36px] tracking-[-0.02em] font-semibold">Agents</h2>
        <p className="text-[14px] leading-[20px] mt-1" style={{ color: "var(--fg-secondary)" }}>
          Connect and manage remote agents on your machines.
        </p>
      </div>

      {/* Approved token banner */}
      {approvedToken && (
        <div
          className="t-card rounded-lg p-4 border-l-4"
          style={{ borderLeftColor: "var(--success)" }}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-2">
                <span className="material-symbols-outlined text-[20px]" style={{ color: "var(--success)" }}>
                  check_circle
                </span>
                <span className="text-[14px] font-semibold">
                  Device Approved: {approvedToken.agentName}
                </span>
              </div>
              <p className="text-[12px] mb-3" style={{ color: "var(--fg-secondary)" }}>
                Save this device token now. It will not be shown again.
              </p>
              <div
                className="flex items-center gap-2 border rounded px-3 py-2 font-[family-name:var(--font-mono)] text-[13px]"
                style={{ background: "var(--code-bg)", borderColor: "var(--border)" }}
              >
                <span className="flex-1 truncate select-all">{approvedToken.token}</span>
                <button
                  onClick={() => copyText(approvedToken.token, setCopiedToken)}
                  className="t-btn-ghost text-[12px] px-2 py-1 rounded transition-colors flex items-center gap-1 shrink-0"
                >
                  <span className="material-symbols-outlined text-[14px]">
                    {copiedToken ? "check" : "content_copy"}
                  </span>
                  {copiedToken ? "Copied" : "Copy"}
                </button>
              </div>
            </div>
            <button
              onClick={() => setApprovedToken(null)}
              className="hover:opacity-80 transition shrink-0"
              style={{ color: "var(--fg-secondary)" }}
            >
              <span className="material-symbols-outlined text-[20px]">close</span>
            </button>
          </div>
        </div>
      )}

      {/* Quick Install Card */}
      <div className="t-card rounded-lg p-4 space-y-4">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-[20px]" style={{ color: "var(--accent)" }}>
            download
          </span>
          <h3 className="text-[14px] leading-[20px] font-semibold">Quick Install</h3>
        </div>

        <p className="text-[13px]" style={{ color: "var(--fg-secondary)" }}>
          Install the agent on any machine:
        </p>

        {/* Curl command */}
        <div
          className="flex items-center gap-2 border rounded px-3 py-2.5 font-[family-name:var(--font-mono)] text-[13px]"
          style={{ background: "var(--code-bg)", borderColor: "var(--border)" }}
        >
          <span className="flex-1 overflow-x-auto whitespace-nowrap select-all" style={{ color: "var(--fg-secondary)" }}>
            {installCmd}
          </span>
          <button
            onClick={() => {
              copyText(installCmd, setCopiedInstall);
              toast("Install command copied", "success");
            }}
            className="t-btn-ghost text-[12px] px-2 py-1 rounded transition-colors flex items-center gap-1 shrink-0"
          >
            <span className="material-symbols-outlined text-[14px]">
              {copiedInstall ? "check" : "content_copy"}
            </span>
            {copiedInstall ? "Copied" : "Copy"}
          </button>
        </div>

        {/* Manual install */}
        <div>
          <p className="text-[12px] mb-1.5" style={{ color: "var(--fg-muted)" }}>
            Or install manually:
          </p>
          <pre
            className="border rounded px-3 py-2 text-[12px] leading-[20px] font-[family-name:var(--font-mono)] overflow-x-auto"
            style={{ background: "var(--code-bg)", borderColor: "var(--border)", color: "var(--fg-secondary)" }}
          >
{`pip install switchboard-agent
switchboard-agent connect ${serverUrl || "YOUR_SERVER"} --key YOUR_KEY`}
          </pre>
        </div>

        {/* API Key */}
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-[13px]" style={{ color: "var(--fg-secondary)" }}>
            Your API key:
          </span>
          {apiKeyLoading ? (
            <Spinner />
          ) : apiKey ? (
            <div className="flex items-center gap-2">
              <code
                className="font-[family-name:var(--font-mono)] text-[13px] px-2 py-0.5 rounded border"
                style={{ background: "var(--code-bg)", borderColor: "var(--border)" }}
              >
                {apiKey}
              </code>
              <button
                onClick={() => {
                  copyText(apiKey, setCopiedKey);
                  toast("API key copied", "success");
                }}
                className="t-btn-ghost text-[12px] px-2 py-1 rounded transition-colors flex items-center gap-1"
              >
                <span className="material-symbols-outlined text-[14px]">
                  {copiedKey ? "check" : "content_copy"}
                </span>
                {copiedKey ? "Copied" : "Copy"}
              </button>
            </div>
          ) : (
            <a
              href="/dashboard/keys"
              className="text-[13px] flex items-center gap-1 transition-colors hover:opacity-80"
              style={{ color: "var(--accent)" }}
            >
              <span className="material-symbols-outlined text-[14px]">add</span>
              Create an API key first
            </a>
          )}
        </div>
      </div>

      {/* Empty State */}
      {!loading && !hasAnyAgents && (
        <div className="t-card rounded-xl overflow-hidden">
          <div className="flex flex-col items-center justify-center py-16" style={{ color: "var(--fg-muted)" }}>
            <span className="material-symbols-outlined text-[48px] mb-3">computer</span>
            <p className="text-[16px] font-semibold mb-1" style={{ color: "var(--fg-secondary)" }}>
              No agents connected
            </p>
            <p className="text-[13px] mb-4">
              Install the Switchboard agent on any machine to get started.
            </p>
            <button
              onClick={() => {
                const card = document.querySelector("[data-install-card]");
                card?.scrollIntoView({ behavior: "smooth" });
              }}
              className="t-btn-ghost text-[12px] px-3 py-1.5 rounded transition-colors flex items-center gap-1.5"
            >
              <span className="material-symbols-outlined text-[14px]">arrow_upward</span>
              Show Install Instructions
            </button>
          </div>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="t-card rounded-xl overflow-hidden">
          <div className="flex flex-col items-center justify-center py-16" style={{ color: "var(--fg-muted)" }}>
            <Spinner size="h-5 w-5" />
            <p className="text-[14px] mt-3">Loading agents...</p>
          </div>
        </div>
      )}

      {/* Pending Approval */}
      {pendingAgents.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <h3 className="text-[14px] leading-[20px] font-semibold">Pending Approval</h3>
            <span
              className="inline-flex items-center justify-center text-[10px] font-bold px-1.5 py-0.5 rounded-full"
              style={{ background: "rgba(234,179,8,0.15)", color: "#eab308" }}
            >
              {pendingAgents.length}
            </span>
          </div>
          <div className="flex flex-col gap-2">
            {pendingAgents.map((agent) => (
              <div
                key={agent.id}
                className="t-card rounded-lg p-4 border-l-4"
                style={{ borderLeftColor: "#eab308" }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <StatusDot status="pending" />
                      <span className="text-[14px] font-semibold">New Device</span>
                      <span className="text-[13px]" style={{ color: "var(--fg-secondary)" }}>
                        &mdash; {agent.name || agent.hostname}
                      </span>
                    </div>
                    <div
                      className="flex items-center gap-2 text-[12px] font-[family-name:var(--font-mono)]"
                      style={{ color: "var(--fg-muted)" }}
                    >
                      <span className="material-symbols-outlined text-[14px]">{osIcon(agent.os)}</span>
                      <span>{agent.os || "Unknown OS"}</span>
                      <span style={{ color: "var(--border)" }}>|</span>
                      <span>{agent.workspace || "~"}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => handleApprove(agent)}
                      className="t-btn text-[12px] font-medium px-3 py-1.5 rounded flex items-center gap-1.5"
                    >
                      <span className="material-symbols-outlined text-[14px]">check</span>
                      Approve
                    </button>
                    <button
                      onClick={() => handleReject(agent.id)}
                      className="t-btn-ghost text-[12px] px-3 py-1.5 rounded transition-colors flex items-center gap-1.5"
                      style={{ color: "var(--error)" }}
                    >
                      <span className="material-symbols-outlined text-[14px]">close</span>
                      Reject
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Online Agents */}
      {onlineAgents.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <h3 className="text-[14px] leading-[20px] font-semibold">Online</h3>
            <span
              className="inline-flex items-center justify-center text-[10px] font-bold px-1.5 py-0.5 rounded-full"
              style={{ background: "rgba(34,197,94,0.15)", color: "#22c55e" }}
            >
              {onlineAgents.length}
            </span>
          </div>
          <div className="flex flex-col gap-2">
            {onlineAgents.map((agent) => (
              <div key={agent.id}>
                <div
                  className="t-card rounded-lg p-4"
                  style={
                    terminalAgentId === agent.id || fileAgentId === agent.id
                      ? { borderBottomLeftRadius: 0, borderBottomRightRadius: 0 }
                      : undefined
                  }
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <StatusDot status="online" />
                        <span className="text-[14px] font-semibold">
                          {agent.name || agent.hostname}
                        </span>
                      </div>
                      <div
                        className="flex items-center gap-2 text-[12px] font-[family-name:var(--font-mono)] flex-wrap"
                        style={{ color: "var(--fg-muted)" }}
                      >
                        <span className="flex items-center gap-1">
                          <span className="material-symbols-outlined text-[14px]">{osIcon(agent.os)}</span>
                          {agent.os || "Unknown"}
                        </span>
                        <span style={{ color: "var(--border)" }}>|</span>
                        <span>{agent.workspace || "~"}</span>
                        {agent.tools && agent.tools.length > 0 && (
                          <>
                            <span style={{ color: "var(--border)" }}>|</span>
                            <span>{agent.tools.length} tools</span>
                          </>
                        )}
                        <span style={{ color: "var(--border)" }}>|</span>
                        <span>Connected {relativeTime(agent.last_seen)}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
                      <button
                        onClick={() => toggleTerminal(agent.id)}
                        className={`text-[12px] px-3 py-1.5 rounded transition-colors flex items-center gap-1.5 ${
                          terminalAgentId === agent.id ? "t-btn" : "t-btn-ghost"
                        }`}
                      >
                        <span className="material-symbols-outlined text-[14px]">terminal</span>
                        Terminal
                      </button>
                      <button
                        onClick={() => openFileBrowser(agent.id)}
                        className={`text-[12px] px-3 py-1.5 rounded transition-colors flex items-center gap-1.5 ${
                          fileAgentId === agent.id ? "t-btn" : "t-btn-ghost"
                        }`}
                      >
                        <span className="material-symbols-outlined text-[14px]">folder</span>
                        Files
                      </button>
                      <button
                        onClick={() => handleDisconnect(agent.id)}
                        className="t-btn-ghost text-[12px] px-3 py-1.5 rounded transition-colors flex items-center gap-1.5"
                        style={{ color: "var(--error)" }}
                      >
                        <span className="material-symbols-outlined text-[14px]">link_off</span>
                        Disconnect
                      </button>
                    </div>
                  </div>
                </div>

                {/* Terminal Panel */}
                {terminalAgentId === agent.id && (
                  <div
                    className="border border-t-0 rounded-b-lg overflow-hidden"
                    style={{ borderColor: "var(--border)" }}
                  >
                    <div
                      className="px-3 py-1.5 flex items-center justify-between"
                      style={{ background: "var(--surface)", borderBottom: "1px solid var(--border)" }}
                    >
                      <span
                        className="font-[family-name:var(--font-mono)] text-[10px] tracking-[0.05em] font-bold uppercase"
                        style={{ color: "var(--fg-muted)" }}
                      >
                        Terminal &mdash; {agent.name || agent.hostname}
                      </span>
                      <button
                        onClick={() => setTerminalAgentId(null)}
                        className="hover:opacity-80 transition"
                        style={{ color: "var(--fg-muted)" }}
                      >
                        <span className="material-symbols-outlined text-[16px]">close</span>
                      </button>
                    </div>
                    <div
                      ref={terminalOutputRef}
                      className="p-3 overflow-y-auto font-[family-name:var(--font-mono)] text-[13px] leading-[20px]"
                      style={{ background: "var(--code-bg)", maxHeight: "360px", minHeight: "120px" }}
                    >
                      {(!terminalHistory[agent.id] || terminalHistory[agent.id].length === 0) && (
                        <div className="text-[12px]" style={{ color: "var(--fg-muted)" }}>
                          Type a command below and press Enter to execute it on the remote agent.
                        </div>
                      )}
                      {(terminalHistory[agent.id] || []).map((entry, idx) => (
                        <div key={idx} className="mb-3">
                          <div className="flex items-center gap-1.5 mb-0.5">
                            <span style={{ color: "var(--success)" }}>$</span>
                            <span style={{ color: "var(--fg)" }}>{entry.command}</span>
                          </div>
                          {entry.output && (
                            <pre
                              className="whitespace-pre-wrap break-all text-[12px]"
                              style={{ color: "var(--fg-secondary)" }}
                            >
                              {entry.output}
                            </pre>
                          )}
                          {entry.exit_code !== 0 && (
                            <div className="text-[11px] mt-0.5" style={{ color: "var(--error)" }}>
                              exit code: {entry.exit_code}
                            </div>
                          )}
                        </div>
                      ))}
                      {terminalRunning && (
                        <div className="flex items-center gap-2" style={{ color: "var(--fg-muted)" }}>
                          <Spinner size="h-3 w-3" />
                          <span className="text-[12px]">Running...</span>
                        </div>
                      )}
                    </div>
                    <form
                      onSubmit={(e) => handleTerminalSubmit(agent.id, e)}
                      className="flex items-center border-t"
                      style={{ borderColor: "var(--border)", background: "var(--code-bg)" }}
                    >
                      <span
                        className="pl-3 font-[family-name:var(--font-mono)] text-[13px]"
                        style={{ color: "var(--success)" }}
                      >
                        $
                      </span>
                      <input
                        ref={terminalInputRef}
                        value={terminalInput}
                        onChange={(e) => setTerminalInput(e.target.value)}
                        className="flex-1 bg-transparent border-none outline-none px-2 py-2.5 font-[family-name:var(--font-mono)] text-[13px]"
                        style={{ color: "var(--fg)" }}
                        placeholder="Enter command..."
                        disabled={terminalRunning}
                        autoComplete="off"
                        spellCheck={false}
                      />
                      <button
                        type="submit"
                        disabled={terminalRunning || !terminalInput.trim()}
                        className="px-3 py-2 transition-colors disabled:opacity-30"
                        style={{ color: "var(--accent)" }}
                      >
                        <span className="material-symbols-outlined text-[18px]">send</span>
                      </button>
                    </form>
                  </div>
                )}

                {/* File Browser Panel */}
                {fileAgentId === agent.id && (
                  <div
                    className="border border-t-0 rounded-b-lg overflow-hidden"
                    style={{ borderColor: "var(--border)" }}
                  >
                    <div
                      className="px-3 py-1.5 flex items-center justify-between"
                      style={{ background: "var(--surface)", borderBottom: "1px solid var(--border)" }}
                    >
                      <span
                        className="font-[family-name:var(--font-mono)] text-[10px] tracking-[0.05em] font-bold uppercase"
                        style={{ color: "var(--fg-muted)" }}
                      >
                        Files &mdash; {agent.name || agent.hostname}
                      </span>
                      <button
                        onClick={() => setFileAgentId(null)}
                        className="hover:opacity-80 transition"
                        style={{ color: "var(--fg-muted)" }}
                      >
                        <span className="material-symbols-outlined text-[16px]">close</span>
                      </button>
                    </div>

                    {/* Breadcrumbs */}
                    <div
                      className="px-3 py-2 flex items-center gap-1 overflow-x-auto font-[family-name:var(--font-mono)] text-[12px]"
                      style={{ background: "var(--surface)", borderBottom: "1px solid var(--border)" }}
                    >
                      <button
                        onClick={() => navigateToBreadcrumb(agent.id, 0)}
                        className="hover:opacity-80 transition flex items-center gap-1 shrink-0"
                        style={{ color: "var(--accent)" }}
                      >
                        <span className="material-symbols-outlined text-[14px]">home</span>
                        root
                      </button>
                      {filePath.map((segment, idx) => (
                        <span key={idx} className="flex items-center gap-1 shrink-0">
                          <span style={{ color: "var(--fg-muted)" }}>/</span>
                          <button
                            onClick={() => navigateToBreadcrumb(agent.id, idx + 1)}
                            className="hover:opacity-80 transition"
                            style={{ color: idx === filePath.length - 1 ? "var(--fg)" : "var(--accent)" }}
                          >
                            {segment}
                          </button>
                        </span>
                      ))}
                    </div>

                    {/* File content view */}
                    {fileContent !== null ? (
                      <div>
                        <div
                          className="px-3 py-2 flex items-center justify-between"
                          style={{ background: "var(--surface)", borderBottom: "1px solid var(--border)" }}
                        >
                          <div className="flex items-center gap-2 text-[12px]">
                            <span className="material-symbols-outlined text-[14px]" style={{ color: "var(--fg-muted)" }}>
                              description
                            </span>
                            <span className="font-[family-name:var(--font-mono)]">{fileContentName}</span>
                          </div>
                          <button
                            onClick={() => {
                              setFileContent(null);
                              setFileContentName(null);
                            }}
                            className="t-btn-ghost text-[12px] px-2 py-1 rounded transition-colors flex items-center gap-1"
                          >
                            <span className="material-symbols-outlined text-[14px]">arrow_back</span>
                            Back
                          </button>
                        </div>
                        <pre
                          className="p-3 text-[13px] leading-[20px] overflow-auto font-[family-name:var(--font-mono)] whitespace-pre-wrap"
                          style={{ background: "var(--code-bg)", color: "var(--fg-secondary)", maxHeight: "400px" }}
                        >
                          {fileContent}
                        </pre>
                      </div>
                    ) : fileLoading ? (
                      <div
                        className="flex items-center justify-center py-10"
                        style={{ background: "var(--code-bg)", color: "var(--fg-muted)" }}
                      >
                        <Spinner />
                        <span className="text-[13px] ml-2">Loading...</span>
                      </div>
                    ) : (
                      <div
                        className="overflow-y-auto"
                        style={{ background: "var(--code-bg)", maxHeight: "360px" }}
                      >
                        {fileEntries.length === 0 ? (
                          <div
                            className="text-center py-10 text-[13px]"
                            style={{ color: "var(--fg-muted)" }}
                          >
                            Empty directory
                          </div>
                        ) : (
                          fileEntries.map((entry, idx) => (
                            <button
                              key={idx}
                              onClick={() =>
                                entry.type === "directory"
                                  ? navigateDir(agent.id, entry.name)
                                  : openFile(agent.id, entry.name)
                              }
                              className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-white/[0.03] transition-colors border-b last:border-b-0 text-[13px]"
                              style={{ borderColor: "var(--border)" }}
                            >
                              <span
                                className="material-symbols-outlined text-[16px] shrink-0"
                                style={{
                                  color: entry.type === "directory" ? "var(--accent)" : "var(--fg-muted)",
                                }}
                              >
                                {entry.type === "directory" ? "folder" : "description"}
                              </span>
                              <span
                                className="flex-1 font-[family-name:var(--font-mono)] truncate"
                                style={{
                                  color: entry.type === "directory" ? "var(--accent)" : "var(--fg-secondary)",
                                }}
                              >
                                {entry.name}
                              </span>
                              {entry.size !== undefined && (
                                <span
                                  className="text-[11px] font-[family-name:var(--font-mono)] shrink-0"
                                  style={{ color: "var(--fg-muted)" }}
                                >
                                  {entry.size < 1024
                                    ? `${entry.size} B`
                                    : entry.size < 1048576
                                    ? `${(entry.size / 1024).toFixed(1)} KB`
                                    : `${(entry.size / 1048576).toFixed(1)} MB`}
                                </span>
                              )}
                              {entry.type === "directory" && (
                                <span
                                  className="material-symbols-outlined text-[14px] shrink-0"
                                  style={{ color: "var(--fg-muted)" }}
                                >
                                  chevron_right
                                </span>
                              )}
                            </button>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Offline Agents */}
      {offlineAgents.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <h3 className="text-[14px] leading-[20px] font-semibold">Offline</h3>
            <span
              className="inline-flex items-center justify-center text-[10px] font-bold px-1.5 py-0.5 rounded-full"
              style={{ background: "rgba(107,114,128,0.15)", color: "#6b7280" }}
            >
              {offlineAgents.length}
            </span>
          </div>
          <div className="flex flex-col gap-2">
            {offlineAgents.map((agent) => (
              <div
                key={agent.id}
                className="t-card rounded-lg p-4"
                style={{ opacity: 0.7 }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <StatusDot status="offline" />
                      <span className="text-[14px] font-semibold" style={{ color: "var(--fg-secondary)" }}>
                        {agent.name || agent.hostname}
                      </span>
                    </div>
                    <div
                      className="flex items-center gap-2 text-[12px] font-[family-name:var(--font-mono)] flex-wrap"
                      style={{ color: "var(--fg-muted)" }}
                    >
                      <span className="flex items-center gap-1">
                        <span className="material-symbols-outlined text-[14px]">{osIcon(agent.os)}</span>
                        {agent.os || "Unknown"}
                      </span>
                      <span style={{ color: "var(--border)" }}>|</span>
                      <span>{agent.workspace || "~"}</span>
                      <span style={{ color: "var(--border)" }}>|</span>
                      <span>Last seen {relativeTime(agent.last_seen)}</span>
                    </div>
                  </div>
                  <button
                    onClick={() => handleDisconnect(agent.id)}
                    className="t-btn-ghost text-[12px] px-3 py-1.5 rounded transition-colors flex items-center gap-1.5 shrink-0"
                    style={{ color: "var(--error)" }}
                  >
                    <span className="material-symbols-outlined text-[14px]">link_off</span>
                    Disconnect
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Bottom info cards */}
      {hasAnyAgents && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="t-card rounded-lg p-4">
            <div className="flex items-start gap-3">
              <span className="material-symbols-outlined text-[20px] mt-0.5" style={{ color: "var(--accent)" }}>
                security
              </span>
              <div>
                <h3 className="text-[14px] leading-[20px] font-semibold">Security</h3>
                <p className="text-[12px] leading-[18px] mt-1" style={{ color: "var(--fg-secondary)" }}>
                  All agents must be explicitly approved before they can connect. Communication is encrypted and
                  authenticated with device tokens. Disconnect any agent at any time to revoke access.
                </p>
              </div>
            </div>
          </div>
          <div className="t-card rounded-lg p-4">
            <div className="flex items-start gap-3">
              <span className="material-symbols-outlined text-[20px] mt-0.5" style={{ color: "var(--accent)" }}>
                info
              </span>
              <div>
                <h3 className="text-[14px] leading-[20px] font-semibold">Remote Tools</h3>
                <p className="text-[12px] leading-[18px] mt-1" style={{ color: "var(--fg-secondary)" }}>
                  Online agents expose tools like terminal and file browser. Use them to manage your machines
                  remotely through the Switchboard interface. Agents auto-reconnect when they come back online.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
