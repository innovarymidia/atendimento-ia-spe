import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().default("file:./dev.db"),
  GEMINI_API_KEY: z.string().min(1, "GEMINI_API_KEY é obrigatória"),
  GEMINI_MODEL: z.string().default("gemini-3.6-flash"),
  EVOLUTION_API_URL: z.string().url("EVOLUTION_API_URL deve ser uma URL válida"),
  EVOLUTION_API_KEY: z.string().min(1, "EVOLUTION_API_KEY é obrigatória"),
  EVOLUTION_INSTANCE: z.string().optional(),
  EVOLUTION_INSTANCE_NAME: z.string().optional(),
  WEBHOOK_SECRET: z.string().optional(),
  MESSAGE_BUFFER_DELAY_MS: z.coerce.number().default(4000),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(", ");
  console.warn(`[CONFIG WARNING] Problemas nas variáveis de ambiente: ${issues}`);
}

export const env = {
  DATABASE_URL: process.env.DATABASE_URL || "file:./dev.db",
  GEMINI_API_KEY: process.env.GEMINI_API_KEY || "",
  GEMINI_MODEL: process.env.GEMINI_MODEL || "gemini-2.5-flash",
  EVOLUTION_API_URL: (process.env.EVOLUTION_API_URL || "").replace(/\/+$/, ""),
  EVOLUTION_API_KEY: process.env.EVOLUTION_API_KEY || "",
  EVOLUTION_INSTANCE:
    process.env.EVOLUTION_INSTANCE || process.env.EVOLUTION_INSTANCE_NAME || "SPE",
  WEBHOOK_SECRET: process.env.WEBHOOK_SECRET || "",
  MESSAGE_BUFFER_DELAY_MS: Number(process.env.MESSAGE_BUFFER_DELAY_MS || 4000),
};
