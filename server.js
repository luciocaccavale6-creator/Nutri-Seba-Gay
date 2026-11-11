import "dotenv/config";
import express from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import OpenAI from "openai";
import { z } from "zod";
import path from "node:path";
import { fileURLToPath } from "node:url";

const app = express();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3000);
const MODEL = process.env.OPENAI_MODEL || "gpt-4.1-mini";
const client = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;

app.disable("x-powered-by");
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: "8mb" }));
app.use("/api/", rateLimit({ windowMs: 60_000, limit: 20, standardHeaders: "draft-7", legacyHeaders: false }));
app.use(express.static(__dirname));

const foodSchema = z.object({
  name: z.string().min(1).max(100),
  quantity: z.number().positive().max(10000),
  unit: z.enum(["g", "ml", "L", "ud"]),
  grams: z.number().nonnegative().max(10000).nullable().optional(),
  calories: z.number().nonnegative().max(10000),
  protein: z.number().nonnegative().max(1000),
  carbs: z.number().nonnegative().max(1000),
  fat: z.number().nonnegative().max(1000),
  note: z.string().max(200).optional()
});
const mealSchema = z.object({
  items: z.array(foodSchema).min(1).max(30),
  assumptions: z.array(z.string().max(300)).max(10).default([]),
  clarification: z.string().max(500).nullable().optional()
});

function requireAI(req, res, next) {
  if (!client) return res.status(503).json({ error: "Falta configurar OPENAI_API_KEY en el archivo .env del servidor." });
  next();
}
function outputText(response) {
  return response.output_text || response.output?.flatMap(x => x.content || []).map(x => x.text || "").join("\n") || "";
}
async function jsonResponse(instructions, input, schema) {
  const response = await client.responses.create({
    model: MODEL,
    instructions,
    input: typeof input === "string" ? input : JSON.stringify(input),
    text: { format: { type: "json_schema", name: "nutrition_result", strict: true, schema } }
  });
  return JSON.parse(outputText(response));
}
const mealJsonSchema = {
  type: "object", additionalProperties: false, required: ["items", "assumptions", "clarification"],
  properties: {
    items: { type: "array", minItems: 1, maxItems: 30, items: {
      type: "object", additionalProperties: false,
      required: ["name","quantity","unit","grams","calories","protein","carbs","fat","note"],
      properties: {
        name:{type:"string"}, quantity:{type:"number"}, unit:{type:"string",enum:["g","ml","L","ud"]},
        grams:{type:["number","null"]}, calories:{type:"number"}, protein:{type:"number"},
        carbs:{type:"number"}, fat:{type:"number"}, note:{type:"string"}
      }
    }},
    assumptions:{type:"array",items:{type:"string"}},
    clarification:{type:["string","null"]}
  }
};

app.post("/api/interpret-meal", requireAI, async (req, res) => {
  try {
    const { text, meal, profile, dailyContext } = req.body || {};
    if (typeof text !== "string" || !text.trim() || text.length > 1500) return res.status(400).json({ error: "Escribí una descripción de hasta 1500 caracteres." });
    const raw = await jsonResponse(
      "Sos un asistente de nutrición. Interpretá la comida en español argentino. Estimá porciones razonables y explícitas. Una tostada es una unidad, no 100 g. Para bebidas usá ml; sólidos pesables g; unidades ud. Descomponé preparaciones en ingredientes. Si falta un dato esencial que impide una estimación razonable, devolvé items=[] y una pregunta en clarification. No inventes precisión: agregá supuestos. Los macros y calorías deben ser estimaciones coherentes por ingrediente. No des diagnóstico médico.",
      { description: text.trim(), meal: meal || "Almuerzo", profile: profile || {}, dailyContext: dailyContext || {} },
      mealJsonSchema
    );
    if (raw.items.length === 0 && raw.clarification) return res.json({ items: [], assumptions: raw.assumptions || [], clarification: raw.clarification });
    const parsed = mealSchema.safeParse(raw);
    if (!parsed.success) return res.status(502).json({ error: "La respuesta nutricional no pasó la validación. Probá de nuevo." });
    res.json(parsed.data);
  } catch (error) {
    console.error("interpret-meal:", error.message);
    res.status(502).json({ error: "No se pudo interpretar la comida. Revisá tu conexión, el modelo y la facturación de OpenAI." });
  }
});

app.post("/api/chat", requireAI, async (req, res) => {
  try {
    const { message, context } = req.body || {};
    if (typeof message !== "string" || !message.trim() || message.length > 4000) return res.status(400).json({ error: "El mensaje debe tener entre 1 y 4000 caracteres." });
    const response = await client.responses.create({
      model: MODEL,
      instructions: "Sos Nutri Seba, un asistente nutricional cercano, prudente y claro. Respondé en español argentino. Usá el contexto de perfil, objetivos y registro cuando esté disponible. No diagnostiques ni reemplaces a un profesional. Aclarar incertidumbre en estimaciones. No afirmes que registraste alimentos: el registro se confirma en la interfaz.",
      input: JSON.stringify({ message: message.trim(), context: context || {} })
    });
    res.json({ reply: outputText(response) });
  } catch (error) {
    console.error("chat:", error.message);
    res.status(502).json({ error: "No se pudo conectar con OpenAI. Intentá nuevamente." });
  }
});

app.post("/api/analyze-nutrition", requireAI, async (req, res) => {
  try {
    const { question, context } = req.body || {};
    if (typeof question !== "string" || !question.trim() || question.length > 2000) return res.status(400).json({ error: "Ingresá una consulta válida." });
    const response = await client.responses.create({
      model: MODEL,
      instructions: "Analizá el registro nutricional aportado. Respondé en español argentino, con observaciones concretas, sin diagnóstico ni prescripciones clínicas. Indicá límites de los datos.",
      input: JSON.stringify({ question, context: context || {} })
    });
    res.json({ analysis: outputText(response) });
  } catch (error) {
    console.error("analyze-nutrition:", error.message);
    res.status(502).json({ error: "No se pudo analizar el registro." });
  }
});

app.post("/api/scan-meal", requireAI, async (req, res) => {
  try {
    const { image, mimeType, meal, profile } = req.body || {};
    if (typeof image !== "string" || image.length > 7_000_000 || !["image/jpeg","image/png","image/webp"].includes(mimeType)) return res.status(400).json({ error: "Imagen inválida. Usá JPG, PNG o WebP de hasta 5 MB." });
    const response = await client.responses.create({
      model: MODEL,
      instructions: "Analizá visualmente esta comida. Estimá alimentos, ingredientes y porciones con cautela. Devolvé únicamente un JSON con items, assumptions y clarification, siguiendo: items [{name,quantity,unit,grams,calories,protein,carbs,fat,note}], assumptions [], clarification null|string. Unidades g, ml, L, ud. Si no se distingue algo, decilo. Las fotos no permiten conocer con precisión peso, aceites ni ingredientes ocultos.",
      input: [{ role: "user", content: [
        { type: "input_text", text: `Comida: ${meal || "Almuerzo"}. Perfil: ${JSON.stringify(profile || {})}. Estimá la porción visible.` },
        { type: "input_image", image_url: `data:${mimeType};base64,${image}` }
      ] }]
    });
    const rawText = outputText(response).replace(/^```(?:json)?\s*|\s*```$/g, "");
    const raw = JSON.parse(rawText);
    const parsed = mealSchema.safeParse(raw);
    if (!parsed.success) return res.status(502).json({ error: "No se pudo validar el análisis de la imagen." });
    res.json(parsed.data);
  } catch (error) {
    console.error("scan-meal:", error.message);
    res.status(502).json({ error: "No se pudo analizar la foto. Probá con otra imagen o ingresá la comida por texto." });
  }
});

app.get("/api/health", (_req, res) => res.json({ ok: true, aiConfigured: Boolean(client), model: MODEL }));
app.get("*", (_req, res) => res.sendFile(path.join(__dirname, "index.html")));
app.listen(PORT, () => console.log(`Nutri Seba Gay listo en http://localhost:${PORT} | IA: ${client ? MODEL : "sin configurar"}`));
