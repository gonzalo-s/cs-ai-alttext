// pages/api/app-config/save-ai-key.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { verifySignedLocation } from "../../../lib/verifySignedLocation";

// simple in-memory store for dev. replace with a secrets manager or DB in prod
const secrets = new Map<string, { provider: "openai"; key: string }>();

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  try {
    if (req.method !== "POST") return res.status(405).end();

    const { stackApiKey } = await verifySignedLocation(req);
    const { provider, key } = req.body || {};
    if (
      provider !== "openai" ||
      typeof key !== "string" ||
      !key.startsWith("sk-")
    ) {
      return res.status(400).send("Invalid payload");
    }

    secrets.set(stackApiKey, { provider: "openai", key });
    // log the saved entry directly for debugging
    console.log(
      "🚀 ~ handler ~ saved for stackApiKey:",
      stackApiKey,
      secrets.get(stackApiKey)
    );
    // return the stackApiKey so the client can confirm which stack key was stored
    return res.status(200).json({ ok: true, stackApiKey });
  } catch (e: any) {
    console.error(e);
    return res.status(401).send(e?.message || "Unauthorized");
  }
}

// helper you can import elsewhere
export function getOpenAIKeyFor(stackApiKey: string) {
  console.log("🚀 ~ getOpenAIKeyFor ~ secrets:", secrets);
  const rec = secrets.get(stackApiKey);
  return rec?.key || "";
}
