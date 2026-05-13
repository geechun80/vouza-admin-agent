// =============================================================================
// Core Types — inspired by Claude Code's Tool.ts & query.ts patterns
// Extended for multi-provider AI, unified Google, Telegram, WhatsApp Web
// =============================================================================

import { z } from "zod";
import type { AIProvider } from "../config/models.js";

// --- Tool System ---

/** Image content block used by vision-capable models (Claude, GPT-4V, Gemini) */
export interface VisionContentBlock {
  type: "image";
  source: {
    type: "base64";
    media_type: "image/jpeg" | "image/png" | "image/gif" | "image/webp";
    data: string;  // base64-encoded image bytes
  };
}

export interface ToolResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  metadata?: Record<string, unknown>;
  /**
   * Optional image for vision-capable models.
   * When present the registry sends the tool result as a content array
   * [text metadata, image block] so the AI can actually see the image.
   */
  _visionBlock?: VisionContentBlock;
}

export interface ToolDefinition<TInput = unknown, TOutput = unknown> {
  name: string;
  description: string;
  category: ToolCategory;
  inputSchema: z.ZodType<TInput>;
  isReadOnly: boolean;
  isConcurrencySafe: boolean;
  call(input: TInput, context: AgentContext): Promise<ToolResult<TOutput>>;
  toAPISchema(): APIToolSchema;
}

export type ToolCategory =
  | "email"
  | "calendar"
  | "spreadsheet"
  | "messaging"
  | "file"
  | "search"
  | "self-improve"
  | "memory"
  | "system";

export interface APIToolSchema {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

// --- Agent Loop ---

export interface AgentContext {
  sessionId: string;
  turnCount: number;
  messages: ConversationMessage[];
  memory: MemoryStore;
  config: AgentConfig;
  tools: Map<string, ToolDefinition>;
  taskQueue: TaskEntry[];
}

export interface ConversationMessage {
  role: "user" | "assistant" | "system";
  content: string | ContentBlock[];
  timestamp: number;
  uuid: string;
}

export type ContentBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: unknown }
  | { type: "tool_result"; tool_use_id: string; content: string | any[]; is_error?: boolean };

export type StreamEvent =
  | { type: "text_delta"; text: string }
  | { type: "tool_start"; toolName: string; input: unknown }
  | { type: "tool_result"; toolName: string; result: ToolResult }
  | { type: "turn_complete"; turnCount: number }
  | { type: "error"; error: string };

export interface AgentState {
  messages: ConversationMessage[];
  turnCount: number;
  maxTurns: number;
  shouldContinue: boolean;
  pendingToolCalls: ToolCall[];
}

export interface ToolCall {
  id: string;
  name: string;
  input: unknown;
}

// --- Memory System ---

export interface MemoryEntry {
  id: string;
  type: MemoryType;
  title: string;
  content: string;
  tags: string[];
  createdAt: number;
  updatedAt: number;
  accessCount: number;
  relevanceScore?: number;
}

export type MemoryType =
  | "contact"       // people, companies, relationships
  | "process"       // how things are done (SOPs)
  | "preference"    // user/company preferences
  | "feedback"      // corrections and confirmations
  | "learned_skill" // auto-generated skills from experience
  | "pattern";      // recurring patterns detected

export interface MemoryStore {
  entries: Map<string, MemoryEntry>;
  load(): Promise<void>;
  save(): Promise<void>;
  add(entry: Omit<MemoryEntry, "id" | "createdAt" | "updatedAt" | "accessCount">): Promise<string>;
  search(query: string, limit?: number): Promise<MemoryEntry[]>;
  update(id: string, updates: Partial<MemoryEntry>): Promise<void>;
  remove(id: string): Promise<void>;
}

// --- Skills System ---

export interface SkillDefinition {
  name: string;
  displayName: string;
  description: string;
  whenToUse: string;
  category: string;
  prompt: string;
  allowedTools: string[];
  selfImproveHooks?: {
    onSuccess?: string;   // action to take on successful execution
    onFailure?: string;   // action to take on failure
    learnFrom?: boolean;  // whether to extract learnings
  };
}

// --- Task System ---

export interface TaskEntry {
  id: string;
  name: string;
  description: string;
  schedule?: string;       // cron expression
  skillName?: string;      // skill to execute
  status: "pending" | "running" | "completed" | "failed";
  lastRun?: number;
  nextRun?: number;
  result?: ToolResult;
  retryCount: number;
  maxRetries: number;
}

// --- Self-Improvement ---

export interface PerformanceLog {
  sessionId: string;
  taskName: string;
  skillUsed?: string;
  toolsUsed: string[];
  success: boolean;
  userFeedback?: "positive" | "negative" | "neutral";
  errorMessage?: string;
  duration: number;
  timestamp: number;
  improvementNotes?: string;
}

export interface ImprovementAction {
  type: "create_skill" | "update_skill" | "update_memory" | "optimize_workflow" | "flag_for_review";
  description: string;
  priority: "low" | "medium" | "high";
  data: Record<string, unknown>;
}

// --- Config ---

export interface AgentConfig {
  name: string;
  model: string;
  provider: AIProvider;
  apiKeys: Record<AIProvider, string>;  // all provider API keys
  memoryDir: string;
  skillsDir: string;
  logDir: string;
  selfImproveIntervalHours: number;
  maxTurnsPerSession: number;
  /**
   * Voice transcription via Whisper.
   * Separate from the main AI provider — Anthropic/OpenRouter users need
   * either an OpenAI key or a free Groq key to enable voice features.
   */
  whisperApiKey?:   string;            // API key for Whisper transcription
  whisperProvider?: "openai" | "groq"; // which endpoint to call
  /** OpenRouter tiered model routing — only used when provider === "openrouter" */
  openrouterTiers?: {
    fast:     string;   // model for simple tasks
    balanced: string;   // model for standard office tasks
    flagship: string;   // model for complex/agentic/vision tasks
  };
  tools: {
    gmail?: { user: string; appPassword: string; emailAddress?: string };
    google?: {                   // unified Google OAuth/service account
      credentialsJson: string;   // path to service account JSON or OAuth JSON
      scopes: string[];          // which APIs to access
    };
    outlook?: {                  // Microsoft Outlook / 365 via Azure OAuth
      clientId: string;
      clientSecret: string;
      tenantId: string;
      email?: string;
    };
    smtp?: { host: string; port: string; user: string; pass: string };
    slack?: { botToken: string };
    telegram?: { botToken: string; webhookUrl?: string };
    whatsapp?: {
      provider: "twilio" | "meta" | "waha" | "web";
      config: Record<string, string>;
    };
  };
  /** Raw credentials bag — stores provider creds not covered by tools above */
  credentials?: Record<string, string>;
}

// --- Template System ---

export interface AgentTemplate {
  id: string;
  name: string;
  description: string;
  version: string;
  author?: string;
  defaultModel: string;
  defaultProvider: AIProvider;
  requiredTools: ToolCategory[];
  optionalTools: ToolCategory[];
  bundledSkills: string[];
  defaultSchedules: Array<{
    skillName: string;
    schedule: string;
    description: string;
  }>;
  systemPrompt: string;
  customConfig?: Record<string, unknown>;
}
