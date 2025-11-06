"use client";
import { useEffect, useMemo, useState } from "react";
import type { FormEvent, MouseEvent } from "react";

export const providers = [
  { name: "OpenAI", models: ["gpt-4.1-mini", "gpt-4o-mini"] as const },
  { name: "Gemini", models: ["gemini-2.0-flash-lite"] as const },
] as const;

export type Provider = (typeof providers)[number];
export type ProviderName = Provider["name"];
export type ProviderModel = Provider["models"][number];

export type SafeConfig = {
  model?: ProviderModel;
  aiKeyMasked?: string;
  providerName?: ProviderName;
};

export default function AppConfig() {
  const [selectedProvider, setSelectedProvider] = useState<Provider>(
    providers[0]
  );
  const [model, setModel] = useState<ProviderModel>(providers[0].models[0]);
  const [aiKey, setAiKey] = useState("");
  const [masked, setMasked] = useState<string | undefined>();
  const [status, setStatus] = useState("");
  const [saving, setSaving] = useState(false);

  // Signed token provided automatically by Contentstack
  const appToken = useMemo(() => {
    if (typeof window === "undefined") return "";
    return new URLSearchParams(window.location.search).get("app-token") || "";
  }, []);

  useEffect(() => {
    (async () => {
      const { default: csSdk } = await import("@contentstack/app-sdk");
      const sdk = await csSdk.init();
      const cfg = (await sdk.getConfig()) as SafeConfig;

      // restore provider first
      const restoredProvider =
        providers.find((p) => p.name === cfg.providerName) ?? providers[0];
      setSelectedProvider(restoredProvider);

      // then restore model if it belongs to that provider
      const allowed = new Set(restoredProvider.models as readonly string[]);
      if (cfg.model && allowed.has(cfg.model)) {
        setModel(cfg.model);
      } else {
        setModel(restoredProvider.models[0]);
      }

      setMasked(cfg.aiKeyMasked);
    })();
  }, []);

  // lightweight decode to read JWT exp without verifying signature
  function getJwtExp(ts: string): number | null {
    try {
      const parts = ts.split(".");
      if (parts.length < 2) return null;
      const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
      const pad = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
      const json = JSON.parse(atob(pad));
      return typeof json.exp === "number" ? json.exp : null;
    } catch {
      return null;
    }
  }

  const saveConfig = async () => {
    try {
      if (!appToken) {
        setStatus("Missing app token. Open from App Configuration.");
        return;
      }
      const exp = getJwtExp(appToken);
      if (exp && exp * 1000 <= Date.now()) {
        setStatus("Session expired. Reloading...");
        setTimeout(() => window.location.reload(), 400);
        return;
      }

      setSaving(true);
      setStatus("Saving...");

      // send secret to backend only, never store plaintext in config
      if (aiKey.trim()) {
        const resp = await fetch("/api/app-config/save-ai-key", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-app-token": appToken,
          },
          body: JSON.stringify({
            provider: selectedProvider.name as ProviderName,
            model,
            key: aiKey.trim(),
          }),
        });

        if (!resp.ok) {
          const msg = await resp.text();
          if (resp.status === 401 && /TOKEN_EXPIRED|expired/i.test(msg)) {
            setStatus("Session expired. Reloading...");
            setTimeout(() => window.location.reload(), 400);
            return;
          }
          throw new Error("Failed to store secret on server");
        }
      }

      const { default: csSdk } = await import("@contentstack/app-sdk");
      const sdk = await csSdk.init();
      const appConfigWidget = sdk.location.AppConfigWidget;

      if (!appConfigWidget) {
        setStatus("Open this from App Configuration in Contentstack");
        return;
      }

      const tail = aiKey ? aiKey.slice(-4) : masked?.slice(-4);
      const maskedTail = tail ? `****${tail}` : masked;

      const install = await appConfigWidget.installation.getInstallationData();

      // Persist to installation storage (some locations may read this)
      await appConfigWidget.installation.setInstallationData({
        ...install,
        configuration: {
          ...install.configuration,
          providerName: selectedProvider.name as ProviderName,
          model,
          aiKeyMasked: maskedTail,
        },
      });

      // // Persist to config so other locations using sdk.getConfig() (e.g., Asset Sidebar) can read it
      // await sdk.setConfig({
      //   providerName: selectedProvider.name as ProviderName,
      //   model,
      //   aiKeyMasked: maskedTail,
      // });

      setAiKey("");
      setMasked(maskedTail);
      setStatus("Saved");
    } catch (e) {
      console.error(e);
      setStatus("Save failed");
    } finally {
      setSaving(false);
    }
  };

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    await saveConfig();
  };

  return (
    <form onSubmit={onSubmit} style={{ padding: 16, maxWidth: 520 }}>
      <h3>AI Alt Text App — Configuration</h3>

      <label style={{ display: "block", marginTop: 12 }}>
        Provider
        <select
          value={selectedProvider.name}
          onChange={(e) => {
            const name = e.target.value as ProviderName;
            const next = providers.find((p) => p.name === name) ?? providers[0];
            setSelectedProvider(next);
            // reset model to first of the selected provider
            setModel(next.models[0]);
          }}
          style={{ display: "block", marginTop: 6 }}
        >
          {providers.map((p) => (
            <option key={p.name} value={p.name}>
              {p.name}
            </option>
          ))}
        </select>
      </label>

      <label style={{ display: "block", marginTop: 12 }}>
        Model
        <select
          value={model}
          onChange={(e) => {
            const value = e.target.value as ProviderModel;
            // guard: only allow models for current provider
            const allowed = new Set(
              selectedProvider.models as readonly string[]
            );
            setModel(allowed.has(value) ? value : selectedProvider.models[0]);
          }}
          style={{ display: "block", marginTop: 6 }}
        >
          {selectedProvider.models.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </label>

      <label style={{ display: "block", marginTop: 12 }}>
        {selectedProvider.name} API Key
        <input
          type="password"
          value={aiKey}
          onChange={(e) => setAiKey(e.target.value)}
          style={{
            display: "block",
            marginTop: 6,
            width: "100%",
            border: "1px solid #ccc",
            borderRadius: 4,
            padding: 8,
          }}
        />
        <div style={{ fontSize: 12, opacity: 0.8, marginTop: 4 }}>
          Stored securely on server. Current: {masked || "none"}
        </div>
      </label>

      <button
        type="button"
        onClick={(e: MouseEvent<HTMLButtonElement>) => {
          e.preventDefault();
          void saveConfig();
        }}
        disabled={saving}
        style={{ marginTop: 16 }}
      >
        {saving ? "Saving..." : "Save configuration"}
      </button>

      <div style={{ marginTop: 8, fontSize: 12 }}>{status}</div>
    </form>
  );
}
