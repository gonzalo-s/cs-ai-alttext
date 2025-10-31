"use client";
import ContentstackAppSDK from "@contentstack/app-sdk";
import { useEffect, useMemo, useState } from "react";

type AppSDK = Awaited<ReturnType<typeof ContentstackAppSDK.init>>;
type AssetSidebarWidget = NonNullable<AppSDK["location"]["AssetSidebarWidget"]>;
type SafeConfig = { model?: string };

export default function AssetSidebar() {
  const [widget, setWidget] = useState<AssetSidebarWidget | null>(null);
  const [model, setModel] = useState("gpt-4o-mini");
  const [assetUid, setAssetUid] = useState("");
  const [assetUrl, setAssetUrl] = useState("");
  const [altText, setAltText] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");

  const appToken = useMemo(() => {
    if (typeof window === "undefined") return "";
    return new URLSearchParams(window.location.search).get("app-token") || "";
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { default: cs } = await import("@contentstack/app-sdk");
      const app = (await cs.init()) as AppSDK;
      if (!mounted) return;

      const locData = await app.location.AssetSidebarWidget?.getData();
      const cfg = (await app.getConfig()) as SafeConfig;

      setWidget(app.location.AssetSidebarWidget ?? null);
      setModel(cfg?.model || "gpt-4o-mini");
      setAssetUid(locData?.uid ?? "");
      setAssetUrl(locData?.url ?? "");
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const generate = async () => {
    if (!assetUrl) return;
    setBusy(true);
    setStatus("Generating alt text...");
    try {
      const r = await fetch("/api/generate-alt", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-app-token": appToken,
        },
        body: JSON.stringify({ imageUrl: assetUrl, model }),
      });
      const j = await r.json();
      setAltText(j.altText || "");
      setStatus("Alt text generated. Review and Save.");
    } catch {
      setStatus("Generation failed");
    } finally {
      setBusy(false);
    }
  };

  const save = async (description: string) => {
    if (!widget) {
      setStatus("Unable to save: widget not available.");
      return;
    }
    await widget.setData({ description });
    setAltText("");
    setStatus("Description set. Please click Save in the CMS, then Publish.");
    try {
      widget.onSave?.(() => setStatus(""));
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="p-3 font-sans flex flex-col gap-4">
      <h3>AI Alt Text</h3>
      <div className="text-xs opacity-80">
        Asset UID: {assetUid || "unknown"}
      </div>

      <button disabled={busy || !assetUrl} onClick={generate}>
        {busy ? "Working..." : "Generate"}
      </button>

      <textarea
        rows={3}
        value={altText}
        onChange={(e) => setAltText(e.target.value)}
        placeholder="Describe this image for accessibility"
        className="border-black border px-2 py-1 mt-4 rounded-md"
      />

      <button disabled={busy || !altText} onClick={() => save(altText)}>
        Save
      </button>

      {status && <div className="mt-2 text-sm">{status}</div>}
    </div>
  );
}
