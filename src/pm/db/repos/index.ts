import { eq, and, inArray } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { getPmDb } from '../connection.js';
import * as schema from '../schema.js';
import type { Comment, Document, Issue, Label, Project } from '../../core/types.js';
import type {
  ICommentRepo,
  IDocumentRepo,
  IIssueLabelRepo,
  IIssueRepo,
  ILabelRepo,
  IPresetRepo,
  IProjectRepo,
  Repositories,
} from '../../core/repos/interfaces.js';

type DbSchema = typeof schema;
type Db = BetterSQLite3Database<DbSchema>;

// Project repository
class DrizzleProjectRepo implements IProjectRepo {
  constructor(private db: Db) {}

  async findAll(): Promise<Project[]> {
    return this.db.select().from(schema.projects).all();
  }

  async findById(id: string): Promise<Project | null> {
    const rows = this.db.select().from(schema.projects).where(eq(schema.projects.id, id)).all();
    return rows[0] ?? null;
  }

  async findBySlug(slug: string): Promise<Project | null> {
    const rows = this.db.select().from(schema.projects).where(eq(schema.projects.slug, slug)).all();
    return rows[0] ?? null;
  }

  async create(data: Omit<Project, 'id' | 'createdAt' | 'updatedAt'>): Promise<Project> {
    const rows = this.db
      .insert(schema.projects)
      .values(data)
      .returning()
      .all();
    return rows[0];
  }

  async update(
    id: string,
    data: Partial<Omit<Project, 'id' | 'createdAt' | 'updatedAt'>>
  ): Promise<Project | null> {
    const rows = this.db
      .update(schema.projects)
      .set({ ...data, updatedAt: Math.floor(Date.now() / 1000) })
      .where(eq(schema.projects.id, id))
      .returning()
      .all();
    return rows[0] ?? null;
  }

  async delete(id: string): Promise<boolean> {
    const result = this.db.delete(schema.projects).where(eq(schema.projects.id, id)).run();
    return result.changes > 0;
  }
}

// Issue repository
class DrizzleIssueRepo implements IIssueRepo {
  constructor(private db: Db) {}

  async findAll(projectId?: string): Promise<Issue[]> {
    if (projectId) {
      return this.db
        .select()
        .from(schema.issues)
        .where(eq(schema.issues.projectId, projectId))
        .all() as Issue[];
    }
    return this.db.select().from(schema.issues).all() as Issue[];
  }

  async findById(id: string): Promise<Issue | null> {
    const rows = this.db.select().from(schema.issues).where(eq(schema.issues.id, id)).all();
    return (rows[0] as Issue) ?? null;
  }

  async findByProjectAndNumber(projectId: string, number: number): Promise<Issue | null> {
    const rows = this.db
      .select()
      .from(schema.issues)
      .where(and(eq(schema.issues.projectId, projectId), eq(schema.issues.number, number)))
      .all();
    return (rows[0] as Issue) ?? null;
  }

  async getNextNumber(projectId: string): Promise<number> {
    const rows = this.db
      .select({ maxNumber: schema.issues.number })
      .from(schema.issues)
      .where(eq(schema.issues.projectId, projectId))
      .all();

    let max = 0;
    for (const row of rows) {
      if (row.maxNumber > max) max = row.maxNumber;
    }
    return max + 1;
  }

  async create(data: Omit<Issue, 'id' | 'createdAt' | 'updatedAt'>): Promise<Issue> {
    const rows = this.db
      .insert(schema.issues)
      .values(data)
      .returning()
      .all();
    return rows[0] as Issue;
  }

  async update(
    id: string,
    data: Partial<Omit<Issue, 'id' | 'createdAt' | 'updatedAt'>>
  ): Promise<Issue | null> {
    const rows = this.db
      .update(schema.issues)
      .set({ ...data, updatedAt: Math.floor(Date.now() / 1000) })
      .where(eq(schema.issues.id, id))
      .returning()
      .all();
    return (rows[0] as Issue) ?? null;
  }

  async delete(id: string): Promise<boolean> {
    const result = this.db.delete(schema.issues).where(eq(schema.issues.id, id)).run();
    return result.changes > 0;
  }
}

// Label repository
class DrizzleLabelRepo implements ILabelRepo {
  constructor(private db: Db) {}

  async findAll(projectId: string): Promise<Label[]> {
    return this.db
      .select()
      .from(schema.labels)
      .where(eq(schema.labels.projectId, projectId))
      .all() as Label[];
  }

  async findById(id: string): Promise<Label | null> {
    const rows = this.db.select().from(schema.labels).where(eq(schema.labels.id, id)).all();
    return (rows[0] as Label) ?? null;
  }

  async findByIds(ids: string[]): Promise<Label[]> {
    if (ids.length === 0) return [];
    return this.db
      .select()
      .from(schema.labels)
      .where(inArray(schema.labels.id, ids))
      .all() as Label[];
  }

  async findByName(projectId: string, name: string): Promise<Label | null> {
    const rows = this.db
      .select()
      .from(schema.labels)
      .where(and(eq(schema.labels.projectId, projectId), eq(schema.labels.name, name)))
      .all();
    return (rows[0] as Label) ?? null;
  }

  async create(data: Omit<Label, 'id' | 'createdAt'>): Promise<Label> {
    const rows = this.db
      .insert(schema.labels)
      .values(data)
      .returning()
      .all();
    return rows[0] as Label;
  }

  async delete(id: string): Promise<boolean> {
    const result = this.db.delete(schema.labels).where(eq(schema.labels.id, id)).run();
    return result.changes > 0;
  }
}

// Issue-Label junction repository
class DrizzleIssueLabelRepo implements IIssueLabelRepo {
  constructor(private db: Db) {}

  async findLabelsByIssue(issueId: string): Promise<Label[]> {
    const rows = this.db
      .select({
        id: schema.labels.id,
        projectId: schema.labels.projectId,
        name: schema.labels.name,
        color: schema.labels.color,
        description: schema.labels.description,
        isBuiltin: schema.labels.isBuiltin,
        createdAt: schema.labels.createdAt,
      })
      .from(schema.issueLabels)
      .innerJoin(schema.labels, eq(schema.issueLabels.labelId, schema.labels.id))
      .where(eq(schema.issueLabels.issueId, issueId))
      .all();
    return rows as Label[];
  }

  async setLabels(issueId: string, labelIds: string[]): Promise<void> {
    // Delete existing labels
    this.db.delete(schema.issueLabels).where(eq(schema.issueLabels.issueId, issueId)).run();

    // Insert new labels
    if (labelIds.length > 0) {
      this.db
        .insert(schema.issueLabels)
        .values(labelIds.map((labelId) => ({ issueId, labelId })))
        .run();
    }
  }
}

// Comment repository
class DrizzleCommentRepo implements ICommentRepo {
  constructor(private db: Db) {}

  async findByIssue(issueId: string): Promise<Comment[]> {
    return this.db
      .select()
      .from(schema.comments)
      .where(eq(schema.comments.issueId, issueId))
      .orderBy(schema.comments.createdAt)
      .all() as Comment[];
  }

  async findById(id: string): Promise<Comment | null> {
    const rows = this.db.select().from(schema.comments).where(eq(schema.comments.id, id)).all();
    return (rows[0] as Comment) ?? null;
  }

  async create(data: Omit<Comment, 'id' | 'createdAt' | 'updatedAt'>): Promise<Comment> {
    const rows = this.db
      .insert(schema.comments)
      .values(data)
      .returning()
      .all();
    return rows[0] as Comment;
  }

  async update(id: string, data: Partial<Pick<Comment, 'content'>>): Promise<Comment | null> {
    const rows = this.db
      .update(schema.comments)
      .set({ ...data, updatedAt: Math.floor(Date.now() / 1000) })
      .where(eq(schema.comments.id, id))
      .returning()
      .all();
    return (rows[0] as Comment) ?? null;
  }

  async delete(id: string): Promise<boolean> {
    const result = this.db.delete(schema.comments).where(eq(schema.comments.id, id)).run();
    return result.changes > 0;
  }
}

// Document repository
class DrizzleDocumentRepo implements IDocumentRepo {
  constructor(private db: Db) {}

  async findByIssue(issueId: string): Promise<Document[]> {
    return this.db
      .select()
      .from(schema.documents)
      .where(eq(schema.documents.issueId, issueId))
      .all() as Document[];
  }

  async findById(id: string): Promise<Document | null> {
    const rows = this.db.select().from(schema.documents).where(eq(schema.documents.id, id)).all();
    return (rows[0] as Document) ?? null;
  }

  async create(data: Omit<Document, 'id' | 'createdAt' | 'updatedAt'>): Promise<Document> {
    const rows = this.db
      .insert(schema.documents)
      .values(data)
      .returning()
      .all();
    return rows[0] as Document;
  }

  async update(
    id: string,
    data: Partial<Omit<Document, 'id' | 'createdAt' | 'updatedAt'>>
  ): Promise<Document | null> {
    const rows = this.db
      .update(schema.documents)
      .set({ ...data, updatedAt: Math.floor(Date.now() / 1000) })
      .where(eq(schema.documents.id, id))
      .returning()
      .all();
    return (rows[0] as Document) ?? null;
  }

  async delete(id: string): Promise<boolean> {
    const result = this.db.delete(schema.documents).where(eq(schema.documents.id, id)).run();
    return result.changes > 0;
  }
}

// Preset repository
class DrizzlePresetRepo implements IPresetRepo {
  constructor(private db: Db) {}

  async findById(id: string): Promise<{ id: string; name: string } | null> {
    const rows = this.db
      .select({ id: schema.modelPresets.id, name: schema.modelPresets.name })
      .from(schema.modelPresets)
      .where(eq(schema.modelPresets.id, id))
      .all();
    return rows[0] ?? null;
  }

  async findDefault(): Promise<{ id: string; name: string } | null> {
    const rows = this.db
      .select({ id: schema.modelPresets.id, name: schema.modelPresets.name })
      .from(schema.modelPresets)
      .where(eq(schema.modelPresets.isDefault, true))
      .all();
    return rows[0] ?? null;
  }
}

// Factory function to create all Drizzle repositories
export function createDrizzleRepositories(dbPath?: string): Repositories {
  const db = getPmDb(dbPath);

  return {
    projects: new DrizzleProjectRepo(db),
    issues: new DrizzleIssueRepo(db),
    labels: new DrizzleLabelRepo(db),
    issueLabels: new DrizzleIssueLabelRepo(db),
    comments: new DrizzleCommentRepo(db),
    documents: new DrizzleDocumentRepo(db),
    presets: new DrizzlePresetRepo(db),
  };
}
