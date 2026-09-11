import { env } from "../config";
import { logger } from "../logger";

export interface SendTextResponse {
  success: boolean;
  messageId?: string;
  error?: string;
}

export class EvolutionService {
  private static getHeaders() {
    return {
      "Content-Type": "application/json",
      apikey: env.EVOLUTION_API_KEY,
    };
  }

  private static formatPhone(phone: string): string {
    const clean = phone.replace(/\D/g, "");
    return clean;
  }

  /**
   * Envia mensagem de texto para um número de WhatsApp via Evolution API com retry controlado.
   */
  static async sendTextMessage(
    phone: string,
    text: string,
    maxRetries = 2
  ): Promise<SendTextResponse> {
    if (!env.EVOLUTION_API_URL || !env.EVOLUTION_API_KEY || !env.EVOLUTION_INSTANCE) {
      logger.error("Evolution API não configurada corretamente", {
        hasUrl: Boolean(env.EVOLUTION_API_URL),
        hasKey: Boolean(env.EVOLUTION_API_KEY),
        instance: env.EVOLUTION_INSTANCE,
      });
      return { success: false, error: "Evolution API credentials not configured" };
    }

    const cleanPhone = this.formatPhone(phone);
    const url = `${env.EVOLUTION_API_URL}/message/sendText/${env.EVOLUTION_INSTANCE}`;
    const payload = {
      number: cleanPhone,
      text: text,
      delay: 1200,
      linkPreview: false,
    };

    let attempt = 0;
    while (attempt <= maxRetries) {
      try {
        logger.info("Evolution API chamada", {
          phone: cleanPhone,
          attempt: attempt + 1,
          instance: env.EVOLUTION_INSTANCE,
        });

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);

        const res = await fetch(url, {
          method: "POST",
          headers: this.getHeaders(),
          body: JSON.stringify(payload),
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        if (!res.ok) {
          const errorText = await res.text();
          throw new Error(`HTTP ${res.status}: ${errorText}`);
        }

        const data = await res.json();
        const externalId = data?.key?.id || data?.id || "evo-" + Date.now();

        return {
          success: true,
          messageId: externalId,
        };
      } catch (err: any) {
        attempt++;
        logger.error("Evolution API falhou", err, {
          phone: cleanPhone,
          attempt,
          willRetry: attempt <= maxRetries,
        });

        if (attempt <= maxRetries) {
          // Espera exponencial breve
          await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
        } else {
          return {
            success: false,
            error: err instanceof Error ? err.message : String(err),
          };
        }
      }
    }

    return { success: false, error: "Exceeded max retries" };
  }

  /**
   * Consulta o status da instância na Evolution API.
   */
  static async getInstanceStatus(): Promise<{ connected: boolean; status: string }> {
    try {
      const url = `${env.EVOLUTION_API_URL}/instance/connectionState/${env.EVOLUTION_INSTANCE}`;
      const res = await fetch(url, {
        method: "GET",
        headers: this.getHeaders(),
      });

      if (!res.ok) {
        return { connected: false, status: `HTTP_${res.status}` };
      }

      const data = await res.json();
      const state = data?.instance?.state || data?.state || "unknown";
      return {
        connected: state === "open",
        status: state,
      };
    } catch (err) {
      logger.error("Falha ao consultar status da instância Evolution", err);
      return { connected: false, status: "error" };
    }
  }

  /**
   * Valida a conexão com a Evolution API.
   */
  static async validateConnection(): Promise<boolean> {
    const status = await this.getInstanceStatus();
    return status.connected;
  }
}
