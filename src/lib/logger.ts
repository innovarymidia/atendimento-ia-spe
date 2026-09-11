type LogLevel = "info" | "warn" | "error" | "debug";

function sanitize(data: any): any {
  if (!data) return data;
  if (typeof data === "string") {
    // Redact sensitive patterns (API keys, secrets, tokens)
    return data
      .replace(/(AIza[0-9A-Za-z-_]{35})/g, "[REDACTED_API_KEY]")
      .replace(/(apikey:\s*)[^\s,]+/gi, "$1[REDACTED]")
      .replace(/(bearer\s+)[^\s,]+/gi, "$1[REDACTED]")
      .replace(/("?(?:api[-_]?key|secret|password|token)"?\s*[:=]\s*"?[^"\s,]+"?)/gi, "[REDACTED]");
  }
  if (Array.isArray(data)) {
    return data.map(sanitize);
  }
  if (typeof data === "object") {
    const sanitizedObj: Record<string, any> = {};
    for (const [key, value] of Object.entries(data)) {
      if (/api[-_]?key|secret|password|token/i.test(key)) {
        sanitizedObj[key] = "[REDACTED]";
      } else {
        sanitizedObj[key] = sanitize(value);
      }
    }
    return sanitizedObj;
  }
  return data;
}

export const logger = {
  info(message: string, context?: Record<string, any>) {
    console.log(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        level: "info",
        message,
        ...(context ? { context: sanitize(context) } : {}),
      })
    );
  },
  warn(message: string, context?: Record<string, any>) {
    console.warn(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        level: "warn",
        message,
        ...(context ? { context: sanitize(context) } : {}),
      })
    );
  },
  error(message: string, error?: any, context?: Record<string, any>) {
    console.error(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        level: "error",
        message,
        error: error instanceof Error ? error.message : sanitize(error),
        stack: error instanceof Error ? error.stack : undefined,
        ...(context ? { context: sanitize(context) } : {}),
      })
    );
  },
  debug(message: string, context?: Record<string, any>) {
    if (process.env.NODE_ENV !== "production") {
      console.log(
        JSON.stringify({
          timestamp: new Date().toISOString(),
          level: "debug",
          message,
          ...(context ? { context: sanitize(context) } : {}),
        })
      );
    }
  },
};
