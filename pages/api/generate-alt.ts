// pages/api/generate-alt.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { verifySignedLocation } from "../../lib/verifySignedLocation";
import { getAIKeyFor } from "./app-config/save-ai-key";
import { generateText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";

// (no-op placeholder removed; AI SDK returns { text })

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  try {
    if (req.method !== "POST") return res.status(405).end();

    // Verify this request comes from the Contentstack UI location
    const { stackApiKey } = await verifySignedLocation(req);

    const { imageUrl } = req.body || {};
    let { model } = (req.body || {}) as {
      imageUrl?: string;
      model?: string;
      provider?: string;
    };
    const provider = (req.body?.provider as string | undefined) || "OpenAI";
    const canonicalProvider: "OpenAI" | "Gemini" =
      String(provider || "OpenAI").toLowerCase() === "gemini"
        ? "Gemini"
        : "OpenAI";
    // Provider-specific defaults
    if (!model) {
      model =
        canonicalProvider === "Gemini"
          ? "gemini-2.0-flash-lite"
          : "gpt-4o-mini";
    }

    // Get the per-stack key for the selected provider
    const apiKey = getAIKeyFor(canonicalProvider, stackApiKey);
    if (!apiKey)
      return res
        .status(400)
        .json({ error: `Missing ${canonicalProvider} API key` });
    if (!imageUrl || typeof imageUrl !== "string") {
      return res.status(400).json({ error: "imageUrl required" });
    }

    // Use Vercel AI SDK with provider-specific model
    const instructions =
      "Write a short alt text for this image for screen readers. Keep it under 140 characters. " +
      "Describe only what is clearly visible. Mention on-image text if legible. Do not guess names or brands.";

    const modelInstance =
      canonicalProvider === "Gemini"
        ? createGoogleGenerativeAI({ apiKey })(model)
        : createOpenAI({ apiKey })(model);

    const { text } = await generateText({
      model: modelInstance,
      temperature: 0.2,
      maxTokens: 120,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: instructions },
            { type: "image", image: imageUrl },
          ],
        },
      ],
    });

    const altText = text || "";
    return res.status(200).json({ altText });
  } catch (e: unknown) {
    console.error(e);
    const msg = (e as { message?: string })?.message || "Unauthorized";
    return res.status(401).json({ error: msg });
  }
}
