// =============================================================================
// AgentBridge — shared singleton for the running agent instance.
//
// Avoids circular imports between server.ts (which owns agentInstance) and
// setup.ts (which needs to hot-patch the live agent after saving credentials).
//
// Pattern:
//   server.ts → setAgentInstance(instance)   on launch / stop
//   setup.ts  → getAgentInstance()           to patch context + restart services
// =============================================================================

/**
 * Minimal interface — intentionally narrow so agentBridge.ts doesn't import
 * from launcher.ts (which would create a circular dependency via setup.ts).
 * AgentInstance structurally satisfies this.
 */
export interface LiveAgent {
  context: {
    config: {
      tools:   Record<string, any>;
      apiKeys: Record<string, string>;
      provider: string;
    };
  };
  serviceManager: {
    restart(name: string): Promise<void>;
    list():   string[];
    health(): Array<{ name: string; status: string }>;
  };
}

let _instance: LiveAgent | null = null;

/** Called by server.ts whenever agentInstance is set or cleared. */
export function setAgentInstance(inst: LiveAgent | null): void {
  _instance = inst;
}

/** Called by tools (e.g. save_integration_credentials) to get the live agent. */
export function getAgentInstance(): LiveAgent | null {
  return _instance;
}
