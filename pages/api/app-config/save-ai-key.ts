import type { NextApiRequest, NextApiResponse } from "next";
import { verifySignedLocation } from "@/lib/verifySignedLocation";

const KEY_STORE = new Map<string, string>(); // key: stackApiKey

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") return res.status(405).end();

  try {
    const signed = await verifySignedLocation(req);

    const { provider, key } = req.body as { provider: string; key: string };
    if (provider !== "openai" || !key?.startsWith("sk-")) {
      return res.status(400).json({ error: "Invalid key" });
    }

    KEY_STORE.set(signed.stackApiKey, key);
    res.status(200).json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(401).json({ error: "Unauthorized" });
  }
}

// Helper for other endpoints
export function getStoredKey(stackApiKey: string) {
  return KEY_STORE.get(stackApiKey);
}
