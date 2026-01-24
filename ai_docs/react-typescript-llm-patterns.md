# React TypeScript LLM-Friendly Patterns

## Overview

This document covers React and TypeScript patterns optimized for LLM code generation and maintainability. LLMs thrive on structured, type-safe code with clear patterns.

## Why TypeScript for LLM Development

1. **Type System as Documentation**: Types provide explicit context for LLMs
2. **Compile-Time Validation**: Errors become specific, localized guidance
3. **Pattern Recognition**: TypeScript's structural typing aligns with LLM pattern matching
4. **Clean Snippets**: React/TypeScript examples are tightly scoped and transferable

## Component Patterns

### 1. Typed Props with Interfaces

```typescript
// Prefer interfaces for component props
interface IssueCardProps {
  id: string;
  title: string;
  status: 'backlog' | 'in_progress' | 'done';
  assignee?: string;
  onStatusChange?: (newStatus: string) => void;
}

// Use const arrow functions (not React.FC)
const IssueCard = ({
  id,
  title,
  status,
  assignee,
  onStatusChange
}: IssueCardProps) => {
  return (
    <div className="issue-card" data-status={status}>
      <h3>{title}</h3>
      {assignee && <span className="assignee">{assignee}</span>}
    </div>
  );
};
```

### 2. Discriminated Unions for State

```typescript
// Model different states explicitly
type AsyncState<T> =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: T }
  | { status: 'error'; error: string };

interface IssueListProps {
  state: AsyncState<Issue[]>;
}

const IssueList = ({ state }: IssueListProps) => {
  switch (state.status) {
    case 'idle':
      return null;
    case 'loading':
      return <Spinner />;
    case 'success':
      return <ul>{state.data.map(issue => <IssueItem key={issue.id} issue={issue} />)}</ul>;
    case 'error':
      return <ErrorMessage message={state.error} />;
  }
};
```

### 3. Exhaustive Checking with `never`

```typescript
function assertNever(x: never): never {
  throw new Error(`Unexpected value: ${x}`);
}

const getStatusColor = (status: IssueStatus): string => {
  switch (status) {
    case 'backlog': return 'gray';
    case 'todo': return 'blue';
    case 'in_progress': return 'yellow';
    case 'done': return 'green';
    default: return assertNever(status); // Compile error if case missed
  }
};
```

### 4. Generic Components

```typescript
// Reusable, type-safe table component
interface Column<T> {
  key: keyof T;
  header: string;
  render?: (value: T[keyof T], row: T) => React.ReactNode;
}

interface DataTableProps<T> {
  data: T[];
  columns: Column<T>[];
  onRowClick?: (row: T) => void;
}

const DataTable = <T extends { id: string | number }>({
  data,
  columns,
  onRowClick
}: DataTableProps<T>) => {
  return (
    <table>
      <thead>
        <tr>
          {columns.map(col => <th key={String(col.key)}>{col.header}</th>)}
        </tr>
      </thead>
      <tbody>
        {data.map(row => (
          <tr key={row.id} onClick={() => onRowClick?.(row)}>
            {columns.map(col => (
              <td key={String(col.key)}>
                {col.render ? col.render(row[col.key], row) : String(row[col.key])}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
};
```

### 5. Utility Types for Props

```typescript
// Derive types from existing definitions
type IssueFormData = Pick<Issue, 'title' | 'description' | 'priority'>;
type IssueUpdateData = Partial<Omit<Issue, 'id' | 'createdAt'>>;

// Record for dynamic objects
type StageColors = Record<IssueStage, string>;

// ReturnType for function results
type FetchIssuesResult = ReturnType<typeof fetchIssues>;
```

## Hook Patterns

### 6. Custom Hooks with Explicit Return Types

```typescript
interface UseIssueReturn {
  issue: Issue | null;
  isLoading: boolean;
  error: string | null;
  updateIssue: (data: Partial<Issue>) => Promise<void>;
  refetch: () => void;
}

const useIssue = (issueId: string): UseIssueReturn => {
  const [issue, setIssue] = useState<Issue | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await api.issues.get(issueId);
      setIssue(data);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setIsLoading(false);
    }
  }, [issueId]);

  useEffect(() => { refetch(); }, [refetch]);

  const updateIssue = useCallback(async (data: Partial<Issue>) => {
    const updated = await api.issues.update(issueId, data);
    setIssue(updated);
  }, [issueId]);

  return { issue, isLoading, error, updateIssue, refetch };
};
```

### 7. Typed Refs

```typescript
const SearchInput = () => {
  const inputRef = useRef<HTMLInputElement>(null);

  const focusInput = () => {
    inputRef.current?.focus();
  };

  return <input ref={inputRef} type="search" />;
};
```

### 8. Forwarded Refs

```typescript
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary';
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', children, ...props }, ref) => {
    return (
      <button ref={ref} className={`btn btn-${variant}`} {...props}>
        {children}
      </button>
    );
  }
);

Button.displayName = 'Button';
```

## State Management with Zustand

### 9. Typed Store Definition

```typescript
import { create } from 'zustand';

interface Issue {
  id: string;
  title: string;
  status: IssueStatus;
}

interface IssueStore {
  issues: Issue[];
  selectedId: string | null;
  isLoading: boolean;

  // Actions
  setIssues: (issues: Issue[]) => void;
  selectIssue: (id: string | null) => void;
  updateIssue: (id: string, updates: Partial<Issue>) => void;
  moveIssue: (id: string, newStatus: IssueStatus) => void;
}

const useIssueStore = create<IssueStore>((set) => ({
  issues: [],
  selectedId: null,
  isLoading: false,

  setIssues: (issues) => set({ issues }),

  selectIssue: (id) => set({ selectedId: id }),

  updateIssue: (id, updates) => set((state) => ({
    issues: state.issues.map(issue =>
      issue.id === id ? { ...issue, ...updates } : issue
    )
  })),

  moveIssue: (id, newStatus) => set((state) => ({
    issues: state.issues.map(issue =>
      issue.id === id ? { ...issue, status: newStatus } : issue
    )
  })),
}));
```

### 10. Selector Hooks (Recommended Pattern)

```typescript
// Always use selectors - even for single values
const useIssues = () => useIssueStore((state) => state.issues);
const useSelectedIssue = () => {
  const selectedId = useIssueStore((state) => state.selectedId);
  const issues = useIssueStore((state) => state.issues);
  return issues.find(i => i.id === selectedId) ?? null;
};
const useIssueActions = () => useIssueStore((state) => ({
  selectIssue: state.selectIssue,
  updateIssue: state.updateIssue,
  moveIssue: state.moveIssue,
}));
```

### Multiple Stores Pattern

```typescript
// Separate stores per feature domain
const useProjectStore = create<ProjectStore>(...);
const useIssueStore = create<IssueStore>(...);
const useAgentStore = create<AgentStore>(...);

// Combine in custom hooks when needed
const useCurrentProjectIssues = () => {
  const currentProjectId = useProjectStore(s => s.currentProjectId);
  const issues = useIssueStore(s => s.issues);
  return issues.filter(i => i.projectId === currentProjectId);
};
```

## Context Patterns

### 11. Strongly-Typed Context

```typescript
interface ThemeContextValue {
  theme: 'light' | 'dark';
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

const useTheme = () => {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return context;
};

const ThemeProvider = ({ children }: { children: React.ReactNode }) => {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');

  const toggleTheme = useCallback(() => {
    setTheme(t => t === 'light' ? 'dark' : 'light');
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};
```

## Composition Patterns

### Container/Presentational Split

```typescript
// Container: handles data and logic
const IssueListContainer = () => {
  const issues = useIssues();
  const { moveIssue } = useIssueActions();

  const handleDragEnd = (result: DropResult) => {
    if (!result.destination) return;
    moveIssue(result.draggableId, result.destination.droppableId as IssueStatus);
  };

  return <IssueListView issues={issues} onDragEnd={handleDragEnd} />;
};

// Presentational: pure rendering
interface IssueListViewProps {
  issues: Issue[];
  onDragEnd: (result: DropResult) => void;
}

const IssueListView = ({ issues, onDragEnd }: IssueListViewProps) => {
  return (
    <DragDropContext onDragEnd={onDragEnd}>
      {/* rendering logic */}
    </DragDropContext>
  );
};
```

### Compound Components

```typescript
interface TabsContextValue {
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

const TabsContext = createContext<TabsContextValue | null>(null);

const Tabs = ({ children, defaultTab }: { children: React.ReactNode; defaultTab: string }) => {
  const [activeTab, setActiveTab] = useState(defaultTab);
  return (
    <TabsContext.Provider value={{ activeTab, setActiveTab }}>
      <div className="tabs">{children}</div>
    </TabsContext.Provider>
  );
};

const TabList = ({ children }: { children: React.ReactNode }) => (
  <div className="tab-list">{children}</div>
);

const Tab = ({ id, children }: { id: string; children: React.ReactNode }) => {
  const ctx = useContext(TabsContext)!;
  return (
    <button
      className={ctx.activeTab === id ? 'active' : ''}
      onClick={() => ctx.setActiveTab(id)}
    >
      {children}
    </button>
  );
};

const TabPanel = ({ id, children }: { id: string; children: React.ReactNode }) => {
  const ctx = useContext(TabsContext)!;
  return ctx.activeTab === id ? <div className="tab-panel">{children}</div> : null;
};

// Usage
<Tabs defaultTab="issues">
  <TabList>
    <Tab id="issues">Issues</Tab>
    <Tab id="agents">Agents</Tab>
  </TabList>
  <TabPanel id="issues"><IssueList /></TabPanel>
  <TabPanel id="agents"><AgentList /></TabPanel>
</Tabs>
```

## LLM-Friendly Conventions

1. **Explicit types over inference** for public APIs
2. **Descriptive prop names** that convey intent
3. **Small, focused components** (< 150 lines)
4. **Consistent naming**: `use*` hooks, `*Props` interfaces, `*Store` for Zustand
5. **Co-located types** with their components
6. **Avoid `any`** - use `unknown` if type is truly dynamic
7. **Prefer composition** over complex conditionals
8. **Document edge cases** in comments

## API Client Pattern

```typescript
// Type-safe API client
const api = {
  issues: {
    list: async (projectId: string): Promise<Issue[]> => {
      const res = await fetch(`/api/projects/${projectId}/issues`);
      if (!res.ok) throw new Error('Failed to fetch issues');
      return res.json();
    },

    get: async (id: string): Promise<Issue> => {
      const res = await fetch(`/api/issues/${id}`);
      if (!res.ok) throw new Error('Issue not found');
      return res.json();
    },

    create: async (data: CreateIssueInput): Promise<Issue> => {
      const res = await fetch('/api/issues', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error('Failed to create issue');
      return res.json();
    },

    update: async (id: string, data: Partial<Issue>): Promise<Issue> => {
      const res = await fetch(`/api/issues/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error('Failed to update issue');
      return res.json();
    },
  },
};
```

## Sources

- [React & TypeScript: 10 patterns for writing better code](https://blog.logrocket.com/react-typescript-10-patterns-writing-better-code/)
- [Why I Choose TypeScript for LLM-Based Coding](https://medium.com/@tl_99311/why-i-choose-typescript-for-llm-based-coding-19cbb19f3fa2)
- [Zustand GitHub](https://github.com/pmndrs/zustand)
- [Working with Zustand](https://tkdodo.eu/blog/working-with-zustand)
- [Zustand Architecture Patterns at Scale](https://brainhub.eu/library/zustand-architecture-patterns-at-scale)
- [Instructions for v0 and GPT to generate high quality React code](https://www.nico.fyi/blog/llm-instructions-for-v0-and-gpt)
