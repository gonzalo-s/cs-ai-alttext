"use client";
import { useEffect, useMemo, useState } from "react";

type SafeConfig = { model?: string; aiKeyMasked?: string };

export default function AppConfig() {
  const [model, setModel] = useState("gpt-4o-mini");
  const [aiKey, setAiKey] = useState("");
  const [masked, setMasked] = useState<string | undefined>();
  const [status, setStatus] = useState("");

  // Signed token provided automatically by Contentstack
  const appToken = useMemo(() => {
    if (typeof window === "undefined") return "";
    return new URLSearchParams(window.location.search).get("app-token") || "";
  }, []);

  useEffect(() => {
    (async () => {
      const { default: csSdk } = await import("@contentstack/app-sdk");
      const sdk = await csSdk.init();

      // sdk.location.AppConfigWidget?.frame?.enableAutoResizing();

      const cfg = (await sdk.getConfig()) as SafeConfig;
      setModel(cfg.model || "gpt-4o-mini");
      setMasked(cfg.aiKeyMasked);
    })();
  }, []);

  const onSave = async () => {
    try {
      if (!appToken) {
        setStatus("Missing app token. Ensure App Configuration is signed.");
        return;
      }

      setStatus("Saving...");

      // Store the real key only on our backend
      if (aiKey.trim()) {
        if (!aiKey.startsWith("sk-")) {
          setStatus("API key must start with sk-");
          return;
        }
        const resp = await fetch("/api/app-config/save-ai-key", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-app-token": appToken,
          },
          body: JSON.stringify({ provider: "openai", key: aiKey.trim() }),
        });
        if (!resp.ok) throw new Error("Failed to store secret on server");
      }

      const { default: csSdk } = await import("@contentstack/app-sdk");
      const sdk = await csSdk.init();

      const appConfigWidget = sdk.location.AppConfigWidget;
      if (!appConfigWidget) {
        setStatus("Must be loaded from App Configuration in Contentstack");
        return;
      }

      const tail = aiKey ? aiKey.slice(-4) : masked?.slice(-4);
      const maskedTail = tail ? `****${tail}` : masked;

      const install = await appConfigWidget.installation.getInstallationData();

      await appConfigWidget.installation.setInstallationData({
        ...install,
        configuration: {
          ...install.configuration,
          model: model,
          aiKeyMasked: maskedTail,
        },
      });

      setAiKey("");
      setMasked(maskedTail);
      setStatus("Saved");
    } catch (e) {
      console.error(e);
      setStatus("Save failed");
    }
  };

  return (
    <div style={{ padding: 16, maxWidth: 520 }}>
      <h3>AI Alt Text App — Configuration</h3>

      <label style={{ display: "block", marginTop: 12 }}>
        Model
        <select
          value={model}
          onChange={(e) => setModel(e.target.value)}
          style={{ display: "block", marginTop: 6 }}
        >
          <option value="gpt-4o-mini">gpt-4o-mini</option>
          <option value="gpt-4.1-mini">gpt-4.1-mini</option>
        </select>
      </label>

      <label style={{ display: "block", marginTop: 12 }}>
        OpenAI API Key
        <input
          type="password"
          value={aiKey}
          onChange={(e) => setAiKey(e.target.value)}
          placeholder="sk-..."
          style={{ display: "block", marginTop: 6, width: "100%" }}
        />
        <div style={{ fontSize: 12, opacity: 0.8, marginTop: 4 }}>
          Stored securely on server. Current: {masked || "none"}
        </div>
      </label>

      <button onClick={onSave} style={{ marginTop: 16 }}>
        Save configuration
      </button>
      <div style={{ marginTop: 8, fontSize: 12 }}>{status}</div>
    </div>
  );
}
