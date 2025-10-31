// pages/api/generate-alt.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { verifySignedLocation } from "../../lib/verifySignedLocation";
import { getOpenAIKeyFor } from "./app-config/save-ai-key";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  try {
    if (req.method !== "POST") return res.status(405).end();

    const { stackApiKey } = await verifySignedLocation(req);
    const key = getOpenAIKeyFor(stackApiKey);
    if (!key) return res.status(400).json({ error: "Missing OpenAI key" });

    const { imageUrl, model = "gpt-4o-mini" } = req.body || {};
    if (!imageUrl || typeof imageUrl !== "string") {
      return res.status(400).json({ error: "imageUrl required" });
    }

    // minimal OpenAI Vision request without external deps
    const openaiRes = await fetch(
      "https://api.openai.com/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: "Write a short, helpful alt text for accessibility.",
                },
                { type: "image_url", image_url: { url: imageUrl } },
              ],
            },
          ],
          temperature: 0.2,
          max_tokens: 120,
        }),
      }
    );

    if (!openaiRes.ok) {
      const msg = await openaiRes.text().catch(() => "");
      return res.status(502).json({ error: "OpenAI error", detail: msg });
    }

    const data = await openaiRes.json();
    const altText = data?.choices?.[0]?.message?.content?.trim?.() || "";
    return res.status(200).json({ altText });
  } catch (e: any) {
    console.error(e);
    return res.status(401).json({ error: e?.message || "Unauthorized" });
  }
}
