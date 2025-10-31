import type { NextApiRequest, NextApiResponse } from "next";
import OpenAI from "openai";
import { getStoredKey } from "./app-config/save-ai-key";
import { verifySignedLocation } from "@/lib/verifySignedLocation";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") return res.status(405).end();

  try {
    const signed = await verifySignedLocation(req);
    const apiKey = getStoredKey(signed.stackApiKey);
    if (!apiKey)
      return res.status(400).json({ error: "AI key not configured" });

    const { imageUrl } = req.body;
    if (!imageUrl) return res.status(400).json({ error: "Missing imageUrl" });

    const openai = new OpenAI({ apiKey });

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "Provide a single accurate sentence of alt-text. No brand guesses.",
        },
        {
          role: "user",
          content: [
            { type: "text", text: "Describe this image:" },
            { type: "image_url", image_url: { url: imageUrl } },
          ],
        },
      ],
      temperature: 0.2,
      max_tokens: 100,
    });

    const altText =
      completion.choices?.[0]?.message?.content?.trim() || "Image";

    return res.status(200).json({ altText });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Generation failed" });
  }
}
