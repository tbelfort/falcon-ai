/**
 * Attribution Agent Runner
 *
 * Calls the Anthropic API to extract structured evidence from
 * Context Pack and Spec documents for a given finding.
 */

import Anthropic from '@anthropic-ai/sdk';
import { EvidenceBundleSchema, type EvidenceBundle } from '../schemas/index.js';
import {
  ATTRIBUTION_AGENT_SYSTEM_PROMPT,
  createAttributionUserPrompt,
  type AttributionUserPromptParams,
} from './prompts/attribution-agent.js';

/**
 * Input for running the Attribution Agent.
 */
export interface RunAttributionAgentInput {
  finding: {
    title: string;
    description: string;
    scoutType: string;
    severity: string;
    evidence: string;
    location: { file: string; line?: number };
  };
  contextPack: string;
  spec: string;
}

/**
 * Options for the agent runner.
 */
export interface AttributionAgentOptions {
  /** Anthropic API key. If not provided, uses ANTHROPIC_API_KEY env var. */
  apiKey?: string;
  /** Model to use. Defaults to claude-sonnet-4-20250514. */
  model?: string;
  /** Maximum tokens for the response. Defaults to 2000. */
  maxTokens?: number;
}

/**
 * Runs the Attribution Agent to extract an EvidenceBundle from documents.
 *
 * @param input - The finding and documents to analyze
 * @param options - Optional configuration
 * @returns The extracted and validated EvidenceBundle
 * @throws Error if the API call fails or response is invalid
 */
export async function runAttributionAgent(
  input: RunAttributionAgentInput,
  options: AttributionAgentOptions = {}
): Promise<EvidenceBundle> {
  const client = new Anthropic({
    apiKey: options.apiKey,
  });

  const model = options.model ?? 'claude-sonnet-4-20250514';
  const maxTokens = options.maxTokens ?? 2000;

  const userPromptParams: AttributionUserPromptParams = {
    finding: input.finding,
    contextPack: input.contextPack,
    spec: input.spec,
  };

  const response = await client.messages.create({
    model,
    max_tokens: maxTokens,
    system: ATTRIBUTION_AGENT_SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: createAttributionUserPrompt(userPromptParams),
      },
    ],
  });

  // Extract text content from response
  const textBlock = response.content.find((block) => block.type === 'text');
  if (!textBlock || textBlock.type !== 'text') {
    throw new Error('No text response from Attribution Agent');
  }

  // Parse and validate JSON response
  const evidence = parseEvidenceResponse(textBlock.text);
  return evidence;
}

/**
 * Parses and validates the Attribution Agent's JSON response.
 *
 * @param responseText - The raw text response from the API
 * @returns The validated EvidenceBundle
 * @throws Error if parsing or validation fails
 */
function parseEvidenceResponse(responseText: string): EvidenceBundle {
  let jsonText = responseText.trim();

  // Handle potential markdown code blocks
  if (jsonText.startsWith('```')) {
    jsonText = jsonText.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
  }

  // Parse JSON
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch (e) {
    throw new Error(
      `Failed to parse Attribution Agent response as JSON: ${e instanceof Error ? e.message : String(e)}`
    );
  }

  // Validate with Zod schema
  const result = EvidenceBundleSchema.safeParse(parsed);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `${i.path.join('.')}: ${i.message}`)
      .join('; ');
    throw new Error(`Invalid EvidenceBundle: ${issues}`);
  }

  return result.data;
}

/**
 * Creates a mock Attribution Agent for testing.
 * Returns a function with the same signature as runAttributionAgent.
 *
 * @param mockResponse - The EvidenceBundle to return
 * @returns A mock agent function
 */
export function createMockAttributionAgent(
  mockResponse: EvidenceBundle
): (input: RunAttributionAgentInput) => Promise<EvidenceBundle> {
  return async (_input: RunAttributionAgentInput) => {
    // Validate the mock response
    EvidenceBundleSchema.parse(mockResponse);
    return mockResponse;
  };
}

/**
 * Creates a mock Attribution Agent that returns different responses
 * based on the finding.
 *
 * @param responseMap - Map of finding titles to EvidenceBundle responses
 * @param defaultResponse - Default response if title not in map
 * @returns A mock agent function
 */
export function createDynamicMockAgent(
  responseMap: Map<string, EvidenceBundle>,
  defaultResponse: EvidenceBundle
): (input: RunAttributionAgentInput) => Promise<EvidenceBundle> {
  return async (input: RunAttributionAgentInput) => {
    const response = responseMap.get(input.finding.title) ?? defaultResponse;
    EvidenceBundleSchema.parse(response);
    return response;
  };
}
