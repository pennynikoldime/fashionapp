import express from "express";
import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

const app = express();
const PORT = 3000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

app.use(express.json({ limit: "10mb" }));
app.use(express.static(__dirname));

app.post("/analyze", async (req, res) => {
  try {
    const { image, texture } = req.body;

    if (!image) {
      return res.status(400).json({ error: "No drawing was provided." });
    }

    const base64Data = image.split(",")[1];

    const model = genAI.getGenerativeModel({ model: "gemini-3.6-flash" });

    const cleanTexture = (typeof texture === "string" && texture.trim()) ? texture.trim().toLowerCase() : "solid";

    const textureInstruction = cleanTexture === "solid"
      ? `The user drew with a plain solid fill, no special fabric texture was selected. Only mention a specific fabric texture (lace, sequins, linen, etc.) if you can actually see it rendered in the image.`
      : `The user selected "${cleanTexture}" as the fabric texture while drawing, and the drawing itself renders that texture visually. Treat every item as being made of ${cleanTexture} fabric unless the image clearly shows otherwise, and work the word "${cleanTexture}" naturally into each item's description (e.g. "${cleanTexture} bodycon mini dress").`;

    const prompt = `
You are analyzing a fashion outfit sketch.

The image contains a simple body silhouette with clothing drawn over it.

Identify each distinct clothing item or accessory the user appears to have drawn.

${textureInstruction}

Do NOT describe the person's body. Do NOT judge appearance.

Return ONLY valid JSON, no markdown, no code fences, no extra text, in exactly this shape:

{
  "items": [
    { "type": "top", "description": "fitted cream cropped tank top" },
    { "type": "bottom", "description": "light-wash low-rise wide-leg jeans" }
  ]
}

Valid "type" values: top, bottom, dress, jacket, shoes, accessory.
Only include items you can actually see drawn. If nothing is drawn, return { "items": [] }.
    `;

    const result = await model.generateContent([
      prompt,
      { inlineData: { mimeType: "image/png", data: base64Data } }
    ]);

    let text = result.response.text().trim();
    text = text.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "").trim();

    const parsed = JSON.parse(text);

    const rawItems = Array.isArray(parsed.items) ? parsed.items : [];
    const items = rawItems.map(item => {
      if (typeof item === "string") {
        return { type: "item", description: item };
      }
      return {
        type: item.type || "item",
        description: item.description || item.name || JSON.stringify(item)
      };
    });

    res.json({ items });

  } catch (error) {
    console.error(error);
    const isOverloaded = error.status === 503 || (error.message && error.message.includes("overloaded"));
    const friendlyMessage = isOverloaded
      ? "The AI is busy right now (Google's servers, not your app). Wait a few seconds and try again."
      : (error.message || "Something went wrong.");
    res.status(500).json({ error: friendlyMessage });
  }
});

app.listen(PORT, () => {
  console.log(`Fashion Finder is running at http://localhost:${PORT}`);
});