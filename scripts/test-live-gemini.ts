import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";
dotenv.config();

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.error("ERRO: GEMINI_API_KEY não encontrada no .env");
  process.exit(1);
}

const ai = new GoogleGenAI({ apiKey });

async function main() {
  console.log("Chamando Gemini com o modelo gemini-3.6-flash...");
  const res = await ai.models.generateContent({
    model: "gemini-3.6-flash",
    contents: "Responda apenas: CONEXAO_GEMINI_OK",
  });
  console.log("RESPOSTA REAL DO GEMINI:", res.text?.trim());
}

main().catch((err) => {
  console.error("Falha ao chamar Gemini ao vivo:", err);
  process.exit(1);
});
