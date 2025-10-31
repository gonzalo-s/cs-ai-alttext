"use client";

import { useEffect, useState } from "react";

/** Minimal types your widget actually uses */
type Asset = {
  uid: string;
  url?: string;
  description?: string;
};

type SidebarWidget = {
  getData<T = Asset>(): Promise<T>;
  setData(data: Partial<Asset>): Promise<void>;
  frame?: { updateHeight(h: number): void | Promise<void> };
  onSave?(cb: () => void): void;
};

type AppLocation = {
  AssetSidebarWidget?: SidebarWidget;
};

type AppSDK = {
  /** In v2 this exists at the root */
  getConfig<T = Record<string, unknown>>(): Promise<T>;
  location: AppLocation;
};

type AppState = {
  config: Record<string, unknown>;
  location: AppLocation | null;
  appSdkInitialized: boolean;
};

export default function AssetSidebar() {
  const [sdk, setSdk] = useState<AppSDK | null>(null);
  const [assetUid, setAssetUid] = useState("");
  const [assetUrl, setAssetUrl] = useState("");
  const [altText, setAltText] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [state, setState] = useState<AppState>({
    config: {},
    location: null,
    appSdkInitialized: false,
  });

  useEffect(() => {
    let mounted = true;
    import("@contentstack/app-sdk").then(async ({ default: csSdk }) => {
      // Do not annotate the param type here; cast the resolved value instead
      const raw = await csSdk.init();
      const appSdk = raw as unknown as AppSDK;

      if (!mounted) return;

      setSdk(appSdk);

      const locData =
        await appSdk.location.AssetSidebarWidget?.getData<Asset>();
      const config = await appSdk.getConfig<Record<string, unknown>>();

      setAssetUid(locData?.uid ?? "");
      setAssetUrl(locData?.url ?? "");

      // Optional
      // await appSdk.location.AssetSidebarWidget?.frame?.updateHeight(360);

      setState({
        config,
        location: appSdk.location,
        appSdkInitialized: true,
      });
    });

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
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ imageUrl: assetUrl }),
      });
      const j = (await r.json()) as { altText?: string };
      setAltText(j.altText || "");
      setStatus("Alt text generated. Review and Save.");
    } catch {
      setStatus("Generation failed");
    } finally {
      setBusy(false);
    }
  };

  const save = async (description: string) => {
    const widget: SidebarWidget | undefined =
      sdk?.location.AssetSidebarWidget ?? state.location?.AssetSidebarWidget;

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

      {status && (
        <div className="mt-2 text-lg text-red-600 font-bold">{status}</div>
      )}
    </div>
  );
}
