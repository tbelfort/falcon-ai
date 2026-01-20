/**
 * Document Change Watcher
 *
 * Invalidates pattern occurrences when their source documents change.
 * Part of Phase 5: Monitoring & Evolution.
 */

import type { Database } from 'better-sqlite3';
import { PatternOccurrenceRepository } from '../storage/repositories/pattern-occurrence.repo.js';

export interface DocChange {
  kind: 'git' | 'linear' | 'web' | 'external';
  repo?: string;
  path?: string;
  docId?: string;
  url?: string;
  externalId?: string;
  newHash?: string;
}

export interface DocChangeResult {
  invalidatedCount: number;
  occurrenceIds: string[];
}

/**
 * Handle document change event - invalidate affected occurrences.
 *
 * When a source document changes (Context Pack, Spec, etc.), the guidance
 * that led to patterns may no longer be accurate. Mark affected occurrences
 * as inactive to prevent stale warnings.
 */
export function onDocumentChange(
  db: Database,
  workspaceId: string,
  change: DocChange
): DocChangeResult {
  const occurrenceRepo = new PatternOccurrenceRepository(db);
  const occurrenceIds: string[] = [];

  let occurrences;

  switch (change.kind) {
    case 'git':
      if (!change.repo || !change.path) {
        return { invalidatedCount: 0, occurrenceIds: [] };
      }
      occurrences = occurrenceRepo.findByGitDoc({
        workspaceId,
        repo: change.repo,
        path: change.path,
      });
      break;

    case 'linear':
      if (!change.docId) {
        return { invalidatedCount: 0, occurrenceIds: [] };
      }
      occurrences = occurrenceRepo.findByLinearDocId({
        workspaceId,
        docId: change.docId,
      });
      break;

    case 'web':
      if (!change.url) {
        return { invalidatedCount: 0, occurrenceIds: [] };
      }
      occurrences = occurrenceRepo.findByWebUrl({
        workspaceId,
        url: change.url,
      });
      break;

    case 'external':
      if (!change.externalId) {
        return { invalidatedCount: 0, occurrenceIds: [] };
      }
      occurrences = occurrenceRepo.findByExternalId({
        workspaceId,
        externalId: change.externalId,
      });
      break;

    default:
      return { invalidatedCount: 0, occurrenceIds: [] };
  }

  // Mark affected occurrences as inactive
  // Use 'superseded_doc' as the reason - document content has changed
  for (const occurrence of occurrences) {
    occurrenceRepo.update({
      workspaceId,
      id: occurrence.id,
      status: 'inactive',
      inactiveReason: 'superseded_doc',
    });
    occurrenceIds.push(occurrence.id);
  }

  console.log(
    `[DocChangeWatcher] Invalidated ${occurrenceIds.length} occurrences due to ${change.kind} document change`
  );

  return {
    invalidatedCount: occurrenceIds.length,
    occurrenceIds,
  };
}
