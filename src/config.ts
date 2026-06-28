export interface ServerConfig {
  wanderlogCookie: string;
}

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

export function readConfig(env: NodeJS.ProcessEnv): ServerConfig {
  const wanderlogCookie = normalizeWanderlogCookie(env.WANDERLOG_COOKIE);

  if (!wanderlogCookie) {
    throw new ConfigError(
      "Set WANDERLOG_COOKIE to your Wanderlog connect.sid cookie.",
    );
  }

  if (!wanderlogCookie.startsWith("s%3A")) {
    throw new ConfigError(
      "WANDERLOG_COOKIE must look like a Wanderlog connect.sid value.",
    );
  }

  return { wanderlogCookie };
}

function normalizeWanderlogCookie(rawCookie: string | undefined): string {
  const trimmedCookie = rawCookie?.trim() ?? "";

  if (trimmedCookie.startsWith("connect.sid=")) {
    return trimmedCookie.slice("connect.sid=".length);
  }

  return trimmedCookie;
}
