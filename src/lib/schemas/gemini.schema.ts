import { z } from "zod";

export const GeminiResponseSchema = z.object({
  reply: z.string().min(1, "A resposta não pode ser vazia"),
  conversation_stage: z
    .enum(["greeting", "qualification", "service_presentation", "closing", "transferred"])
    .default("qualification"),
  lead_temperature: z.enum(["cold", "warm", "hot"]).default("warm"),
  extracted_data: z.record(z.string(), z.string()).default({}),
  should_transfer_to_human: z.boolean().default(false),
  transfer_reason: z
    .enum([
      "USER_REQUEST",
      "EXISTING_STUDENT",
      "EX_STUDENT",
      "COMPLEX_CASE",
      "SAFETY_RISK",
      "COMPLAINT",
      "NEGOTIATION",
      "UNKNOWN_INFORMATION",
      "READY_TO_CLOSE",
    ])
    .nullable()
    .default(null),
});

export type GeminiResponse = z.infer<typeof GeminiResponseSchema>;
