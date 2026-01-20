/**
 * TaskProfile Extractor
 *
 * Extracts TaskProfile from Linear issues and Context Pack metadata.
 * Used for pattern matching during injection selection.
 */

import type { TaskProfile, Touch } from '../schemas/index.js';
import type { ContextPackMetadata } from './context-pack-metadata.js';

export interface IssueData {
  title: string;
  description: string;
  labels: string[];
}

/**
 * Extract TaskProfile from Linear issue data.
 * Used for preliminary injection before Context Pack exists.
 */
export function extractTaskProfileFromIssue(issue: IssueData): TaskProfile {
  const text = `${issue.title} ${issue.description}`.toLowerCase();
  const labelText = issue.labels.map((l) => l.toLowerCase()).join(' ');
  const combined = `${text} ${labelText}`;

  const touches = extractTouches(combined);
  const technologies = extractTechnologies(combined);
  const taskTypes = extractTaskTypes(combined);
  const confidence = calculateConfidence(touches, technologies, taskTypes);

  return {
    touches,
    technologies,
    taskTypes,
    confidence,
  };
}

/**
 * Extract TaskProfile from Context Pack metadata.
 * More accurate than issue extraction.
 * Uses formal ContextPackMetadata contract from context-pack-metadata.ts.
 */
export function extractTaskProfileFromContextPack(
  metadata: ContextPackMetadata
): TaskProfile {
  // If Context Pack provides explicit taskProfile, use it
  if (metadata.taskProfile) {
    return {
      touches: (metadata.taskProfile.touches as Touch[]) || [],
      technologies: metadata.taskProfile.technologies || [],
      taskTypes: metadata.taskProfile.taskTypes || [],
      confidence: metadata.taskProfile.confidence || 0.8,
    };
  }

  // Otherwise, infer from constraints
  const constraintText =
    metadata.constraintsExtracted
      ?.map((c) => c.constraint)
      .join(' ')
      .toLowerCase() || '';

  return {
    touches: extractTouches(constraintText),
    technologies: extractTechnologies(constraintText),
    taskTypes: extractTaskTypes(constraintText),
    confidence: 0.6, // Lower confidence when inferring
  };
}

/**
 * Extract touches from text using keyword patterns.
 */
export function extractTouches(text: string): Touch[] {
  const touches: Touch[] = [];

  const patterns: [RegExp, Touch][] = [
    // user_input
    [
      /\b(user.?input|form|request.?body|query.?param|payload|user.?data|input.?valid)/i,
      'user_input',
    ],
    // database
    [
      /\b(database|sql|query|postgres|mysql|mongo|db|crud|insert|update|delete|select)/i,
      'database',
    ],
    // network
    [
      /\b(network|http|api.?call|fetch|request|external.?service|webhook|client)/i,
      'network',
    ],
    // auth
    [/\b(auth|login|logout|session|token|jwt|oauth|password|credential)/i, 'auth'],
    // authz
    [
      /\b(permission|role|access.?control|rbac|authz|authorize|privilege|acl)/i,
      'authz',
    ],
    // caching
    [/\b(cache|redis|memcache|caching|ttl|invalidat)/i, 'caching'],
    // schema
    [/\b(schema|migration|alter|ddl|table|column|index|constraint)/i, 'schema'],
    // logging
    [/\b(log|logging|trace|audit|monitor|telemetry|metric)/i, 'logging'],
    // config
    [/\b(config|env|environment|setting|feature.?flag|toggle)/i, 'config'],
    // api
    [/\b(api|endpoint|route|rest|graphql|handler|controller)/i, 'api'],
  ];

  for (const [pattern, touch] of patterns) {
    if (pattern.test(text) && !touches.includes(touch)) {
      touches.push(touch);
    }
  }

  return touches;
}

/**
 * Extract technologies from text using keyword patterns.
 */
export function extractTechnologies(text: string): string[] {
  const techs: string[] = [];

  const patterns: [RegExp, string][] = [
    [/\bpostgres(ql)?\b/i, 'postgres'],
    [/\bmysql\b/i, 'mysql'],
    [/\bmongo(db)?\b/i, 'mongodb'],
    [/\bredis\b/i, 'redis'],
    [/\bsql\b/i, 'sql'],
    [/\bgraphql\b/i, 'graphql'],
    [/\brest\b/i, 'rest'],
    [/\bgrpc\b/i, 'grpc'],
    [/\bwebsocket\b/i, 'websocket'],
    [/\breact\b/i, 'react'],
    [/\bvue\b/i, 'vue'],
    [/\bnode(js)?\b/i, 'nodejs'],
    [/\btypescript\b/i, 'typescript'],
    [/\bpython\b/i, 'python'],
    [/\bjava\b/i, 'java'],
    [/\bkafka\b/i, 'kafka'],
    [/\brabbitmq\b/i, 'rabbitmq'],
    [/\belasticsearch\b/i, 'elasticsearch'],
    [/\bs3\b/i, 's3'],
    [/\bdocker\b/i, 'docker'],
    [/\bkubernetes\b/i, 'kubernetes'],
  ];

  for (const [pattern, tech] of patterns) {
    if (pattern.test(text) && !techs.includes(tech)) {
      techs.push(tech);
    }
  }

  return techs;
}

/**
 * Extract task types from text using keyword patterns.
 */
export function extractTaskTypes(text: string): string[] {
  const types: string[] = [];

  const patterns: [RegExp, string][] = [
    [/\b(api|endpoint|route)\b/i, 'api'],
    [/\b(database|query|data.?layer)\b/i, 'database'],
    [/\b(migration|schema.?change)\b/i, 'migration'],
    [/\b(ui|frontend|component|page|view)\b/i, 'ui'],
    [/\b(auth|login|signup|session)\b/i, 'auth'],
    [/\b(background|job|worker|queue|async)\b/i, 'background-job'],
    [/\b(test|testing|spec|unit|integration)\b/i, 'testing'],
    [/\b(refactor|cleanup|tech.?debt)\b/i, 'refactor'],
    [/\b(bug|fix|hotfix|patch)\b/i, 'bugfix'],
    [/\b(feature|new|implement|add)\b/i, 'feature'],
    [/\b(deploy|release|ci|cd)\b/i, 'deployment'],
    [/\b(doc|documentation|readme)\b/i, 'documentation'],
  ];

  for (const [pattern, type] of patterns) {
    if (pattern.test(text) && !types.includes(type)) {
      types.push(type);
    }
  }

  return types;
}

/**
 * Calculate confidence based on extraction richness.
 */
function calculateConfidence(
  touches: Touch[],
  technologies: string[],
  taskTypes: string[]
): number {
  let confidence = 0.3; // Base

  // More extracted info = higher confidence
  if (touches.length > 0) confidence += 0.2;
  if (touches.length > 2) confidence += 0.1;
  if (technologies.length > 0) confidence += 0.15;
  if (technologies.length > 1) confidence += 0.05;
  if (taskTypes.length > 0) confidence += 0.15;
  if (taskTypes.length > 1) confidence += 0.05;

  return Math.min(confidence, 1.0);
}
