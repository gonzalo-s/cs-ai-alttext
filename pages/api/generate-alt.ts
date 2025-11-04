// pages/api/generate-alt.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { verifySignedLocation } from "../../lib/verifySignedLocation";
import { getOpenAIKeyFor } from "./app-config/save-ai-key";
import OpenAI from "openai";

// Extract plain text from the Responses API
function extractText(resp: OpenAI.Responses.Response): string {
  console.log("🚀 ~ extractText ~ resp:", resp);
  // Preferred helper when available
  const asText = resp?.output_text;
  if (typeof asText === "string" && asText.trim()) return asText.trim();

  // Fallback to walking the output array
  const block = resp?.output?.find?.(
    (b: any) =>
      Array.isArray(b?.content) &&
      b.content.some((c: any) => c.type === "output_text")
  );
  const textPart = block?.content?.find?.((c: any) => c.type === "output_text");
  if (typeof textPart?.text === "string") return textPart.text.trim();

  // Last resort
  return "";
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  try {
    if (req.method !== "POST") return res.status(405).end();

    // Verify this request comes from the Contentstack UI location
    const { stackApiKey } = await verifySignedLocation(req);
    console.log("🚀 ~ handler ~ stackApiKey:", stackApiKey);

    // Get the per-stack OpenAI key that you stored in /api/app-config/save-ai-key
    const apiKey = getOpenAIKeyFor(stackApiKey);
    console.log("🚀 ~ handler ~ apiKey:", apiKey);
    if (!apiKey) return res.status(400).json({ error: "Missing OpenAI key" });

    const { imageUrl, model = "gpt-4o-mini" } = req.body || {};
    if (!imageUrl || typeof imageUrl !== "string") {
      return res.status(400).json({ error: "imageUrl required" });
    }

    // Create a per-request OpenAI client with this stack's key
    const openai = new OpenAI({ apiKey });

    // Use the Responses API with image url input
    const instructions =
      "Write a short alt text for this image for screen readers. Keep it under 140 characters. " +
      "Describe only what is clearly visible. Mention on-image text if legible. Do not guess names or brands.";

    const response = await openai.responses.create({
      model: model,
      input: [
        {
          role: "user",
          content: [
            { type: "input_text", text: instructions },
            { type: "input_image", image_url: imageUrl },
          ] as any,
        },
      ],
      temperature: 0.2,
      max_output_tokens: 120,
    });

    const altText = extractText(response) || "";
    return res.status(200).json({ altText });
  } catch (e: any) {
    console.error(e);
    return res.status(401).json({ error: e?.message || "Unauthorized" });
  }
}
