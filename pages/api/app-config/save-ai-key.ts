// pages/api/app-config/save-ai-key.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { verifySignedLocation } from "../../../lib/verifySignedLocation";

// simple in-memory store for dev. replace with a secrets manager or DB in prod
// Keyed by `${Provider}:${stackApiKey}` to support multiple providers per stack
const secrets = new Map<
  string,
  { provider: "OpenAI" | "Gemini"; key: string }
>();

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  try {
    if (req.method !== "POST") return res.status(405).end();

    const { stackApiKey } = await verifySignedLocation(req);
    const { provider, key, model } = (req.body || {}) as {
      provider?: string;
      key?: string;
      model?: string;
    };
    const canonical: "OpenAI" | "Gemini" =
      String(provider || "OpenAI").toLowerCase() === "gemini"
        ? "Gemini"
        : "OpenAI";
    if (typeof key !== "string" || !key.trim()) {
      return res.status(400).send("Invalid payload");
    }

    const mapKey = `${canonical}:${stackApiKey}`;
    secrets.set(mapKey, { provider: canonical, key: key.trim() });
    // return the stackApiKey and provider so the client can confirm which secret was stored
    return res
      .status(200)
      .json({ ok: true, stackApiKey, provider: canonical, model });
  } catch (e: unknown) {
    console.error(e);
    const msg = (e as { message?: string })?.message || "Unauthorized";
    return res.status(401).send(msg);
  }
}

// helper you can import elsewhere
export function getAIKeyFor(
  provider: "OpenAI" | "Gemini",
  stackApiKey: string
) {
  const rec = secrets.get(`${provider}:${stackApiKey}`);
  return rec?.key || "";
}
