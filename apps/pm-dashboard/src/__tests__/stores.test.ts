import { act } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { server } from '@/mocks/server';
import { useProjectStore } from '@/stores/projects';
import { useIssuesStore } from '@/stores/issues';

describe('useProjectStore', () => {
  beforeEach(() => {
    useProjectStore.setState({
      projects: { status: 'idle' },
      selectedProjectId: null,
      abortController: null,
    });
  });

  describe('loadProjects', () => {
    it('loads projects and auto-selects the first one', async () => {
      await act(async () => {
        await useProjectStore.getState().loadProjects();
      });

      const state = useProjectStore.getState();
      expect(state.projects.status).toBe('success');
      if (state.projects.status === 'success') {
        expect(state.projects.data).toHaveLength(1);
        expect(state.projects.data[0].name).toBe('Falcon PM');
      }
      expect(state.selectedProjectId).toBe('proj-falcon');
    });

    it('handles error when API fails', async () => {
      server.use(
        http.get('/api/projects', () =>
          HttpResponse.json(
            { error: { code: 'server_error', message: 'Database unavailable' } },
            { status: 500 },
          ),
        ),
      );

      await act(async () => {
        await useProjectStore.getState().loadProjects();
      });

      const state = useProjectStore.getState();
      expect(state.projects.status).toBe('error');
      if (state.projects.status === 'error') {
        expect(state.projects.error).toBe('Database unavailable');
      }
    });

    it('aborts previous request when loadProjects is called again', async () => {
      const abortSpy = vi.fn();
      const slowHandler = http.get('/api/projects', async () => {
        await new Promise((resolve) => setTimeout(resolve, 100));
        return HttpResponse.json({ data: [] });
      });
      server.use(slowHandler);

      // Start first request
      const firstPromise = act(async () => {
        await useProjectStore.getState().loadProjects();
      });

      // Immediately start second request (should abort first)
      const secondPromise = act(async () => {
        await useProjectStore.getState().loadProjects();
      });

      await Promise.all([firstPromise, secondPromise]);

      // Final state should be from the second request
      const state = useProjectStore.getState();
      expect(state.abortController).toBeNull();
    });
  });

  describe('selectProject', () => {
    it('updates selectedProjectId', () => {
      useProjectStore.getState().selectProject('proj-other');
      expect(useProjectStore.getState().selectedProjectId).toBe('proj-other');
    });
  });

  describe('reset', () => {
    it('resets state to initial values', async () => {
      await act(async () => {
        await useProjectStore.getState().loadProjects();
      });

      useProjectStore.getState().reset();

      const state = useProjectStore.getState();
      expect(state.projects.status).toBe('idle');
      expect(state.selectedProjectId).toBeNull();
      expect(state.abortController).toBeNull();
    });
  });
});

describe('useIssuesStore', () => {
  beforeEach(() => {
    useIssuesStore.setState({
      issues: { status: 'idle' },
      labelsByProjectId: {},
      commentsByIssueId: {},
      issuesAbortController: null,
      labelsAbortController: null,
    });
  });

  describe('loadIssues', () => {
    it('loads issues for a project', async () => {
      await act(async () => {
        await useIssuesStore.getState().loadIssues('proj-falcon');
      });

      const state = useIssuesStore.getState();
      expect(state.issues.status).toBe('success');
      if (state.issues.status === 'success') {
        expect(state.issues.data).toHaveLength(8);
        expect(state.issues.data[0].title).toBe('Bootstrap PM dashboard shell');
        expect(state.issues.data[0].stage).toBe('BACKLOG');
      }
    });

    it('handles error when API fails', async () => {
      server.use(
        http.get('/api/issues', () =>
          HttpResponse.json(
            { error: { code: 'project_not_found', message: 'Project not found' } },
            { status: 404 },
          ),
        ),
      );

      await act(async () => {
        await useIssuesStore.getState().loadIssues('invalid-project');
      });

      const state = useIssuesStore.getState();
      expect(state.issues.status).toBe('error');
      if (state.issues.status === 'error') {
        expect(state.issues.error).toBe('Project not found');
      }
    });

    it('aborts previous request when loadIssues is called again', async () => {
      const slowHandler = http.get('/api/issues', async () => {
        await new Promise((resolve) => setTimeout(resolve, 100));
        return HttpResponse.json({ data: [] });
      });
      server.use(slowHandler);

      const firstPromise = act(async () => {
        await useIssuesStore.getState().loadIssues('proj-falcon');
      });

      const secondPromise = act(async () => {
        await useIssuesStore.getState().loadIssues('proj-falcon');
      });

      await Promise.all([firstPromise, secondPromise]);

      const state = useIssuesStore.getState();
      expect(state.issuesAbortController).toBeNull();
    });
  });

  describe('loadLabels', () => {
    it('loads labels for a project', async () => {
      await act(async () => {
        await useIssuesStore.getState().loadLabels('proj-falcon');
      });

      const state = useIssuesStore.getState();
      const labels = state.labelsByProjectId['proj-falcon'];
      expect(labels?.status).toBe('success');
      if (labels?.status === 'success') {
        expect(labels.data).toHaveLength(5);
        expect(labels.data[0].name).toBe('UX');
        expect(labels.data[0].color).toBe('#c96b3c');
      }
    });

    it('handles error when API fails', async () => {
      server.use(
        http.get('/api/projects/:id/labels', () =>
          HttpResponse.json(
            { error: { code: 'server_error', message: 'Unable to fetch labels' } },
            { status: 500 },
          ),
        ),
      );

      await act(async () => {
        await useIssuesStore.getState().loadLabels('proj-falcon');
      });

      const state = useIssuesStore.getState();
      const labels = state.labelsByProjectId['proj-falcon'];
      expect(labels?.status).toBe('error');
      if (labels?.status === 'error') {
        expect(labels.error).toBe('Unable to fetch labels');
      }
    });
  });

  describe('addComment', () => {
    it('adds a comment to an issue', async () => {
      await act(async () => {
        await useIssuesStore.getState().addComment('issue-102', 'Test comment', 'Tester');
      });

      const state = useIssuesStore.getState();
      const comments = state.commentsByIssueId['issue-102'];
      expect(comments?.status).toBe('success');
      if (comments?.status === 'success') {
        expect(comments.data.some((c) => c.content === 'Test comment')).toBe(true);
      }
    });

    it('appends to existing comments', async () => {
      // First load existing comments
      await act(async () => {
        await useIssuesStore.getState().loadComments('issue-102');
      });

      const beforeState = useIssuesStore.getState();
      const beforeComments = beforeState.commentsByIssueId['issue-102'];
      const beforeCount = beforeComments?.status === 'success' ? beforeComments.data.length : 0;

      // Add a new comment
      await act(async () => {
        await useIssuesStore.getState().addComment('issue-102', 'Another comment');
      });

      const afterState = useIssuesStore.getState();
      const afterComments = afterState.commentsByIssueId['issue-102'];
      expect(afterComments?.status).toBe('success');
      if (afterComments?.status === 'success') {
        expect(afterComments.data.length).toBe(beforeCount + 1);
        expect(afterComments.data[afterComments.data.length - 1].content).toBe('Another comment');
      }
    });

    it('creates comment list if none exists', async () => {
      // Ensure no comments loaded for this issue
      expect(useIssuesStore.getState().commentsByIssueId['issue-101']).toBeUndefined();

      await act(async () => {
        await useIssuesStore.getState().addComment('issue-101', 'First comment');
      });

      const state = useIssuesStore.getState();
      const comments = state.commentsByIssueId['issue-101'];
      expect(comments?.status).toBe('success');
      if (comments?.status === 'success') {
        expect(comments.data).toHaveLength(1);
        expect(comments.data[0].content).toBe('First comment');
      }
    });

    it('calls onError callback when API fails', async () => {
      server.use(
        http.post('/api/issues/:id/comments', () =>
          HttpResponse.json(
            { error: { code: 'server_error', message: 'Failed to create comment' } },
            { status: 500 },
          ),
        ),
      );

      const onError = vi.fn();

      await act(async () => {
        await useIssuesStore.getState().addComment('issue-102', 'Test comment', undefined, onError);
      });

      expect(onError).toHaveBeenCalledWith('Failed to create comment');
    });

    it('logs to console when API fails and no onError provided', async () => {
      server.use(
        http.post('/api/issues/:id/comments', () =>
          HttpResponse.json(
            { error: { code: 'server_error', message: 'Server error' } },
            { status: 500 },
          ),
        ),
      );

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      await act(async () => {
        await useIssuesStore.getState().addComment('issue-102', 'Test comment');
      });

      expect(consoleSpy).toHaveBeenCalledWith('Server error');
      consoleSpy.mockRestore();
    });
  });

  describe('updateLabels', () => {
    it('updates labels for an issue', async () => {
      // First load issues
      await act(async () => {
        await useIssuesStore.getState().loadIssues('proj-falcon');
      });

      server.use(
        http.patch('/api/issues/:id', () =>
          HttpResponse.json({
            data: {
              id: 'issue-101',
              projectId: 'proj-falcon',
              number: 101,
              title: 'Bootstrap PM dashboard shell',
              description: 'Create the initial app shell.',
              stage: 'BACKLOG',
              assignedAgentId: null,
              labels: [{ id: 'label-ws', projectId: 'proj-falcon', name: 'Realtime', color: '#2b4a66' }],
            },
          }),
        ),
      );

      await act(async () => {
        await useIssuesStore.getState().updateLabels('issue-101', ['label-ws']);
      });

      const state = useIssuesStore.getState();
      if (state.issues.status === 'success') {
        const issue = state.issues.data.find((i) => i.id === 'issue-101');
        expect(issue?.labels).toHaveLength(1);
        expect(issue?.labels[0].name).toBe('Realtime');
      }
    });

    it('calls onError callback when API fails', async () => {
      // First load issues
      await act(async () => {
        await useIssuesStore.getState().loadIssues('proj-falcon');
      });

      server.use(
        http.patch('/api/issues/:id', () =>
          HttpResponse.json(
            { error: { code: 'server_error', message: 'Failed to update labels' } },
            { status: 500 },
          ),
        ),
      );

      const onError = vi.fn();

      await act(async () => {
        await useIssuesStore.getState().updateLabels('issue-101', ['label-ws'], onError);
      });

      expect(onError).toHaveBeenCalledWith('Failed to update labels');
    });

    it('logs to console when API fails and no onError provided', async () => {
      // First load issues
      await act(async () => {
        await useIssuesStore.getState().loadIssues('proj-falcon');
      });

      server.use(
        http.patch('/api/issues/:id', () =>
          HttpResponse.json(
            { error: { code: 'server_error', message: 'Label update error' } },
            { status: 500 },
          ),
        ),
      );

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      await act(async () => {
        await useIssuesStore.getState().updateLabels('issue-101', ['label-ws']);
      });

      expect(consoleSpy).toHaveBeenCalledWith('Label update error');
      consoleSpy.mockRestore();
    });
  });

  describe('loadComments', () => {
    it('loads comments for an issue', async () => {
      await act(async () => {
        await useIssuesStore.getState().loadComments('issue-102');
      });

      const state = useIssuesStore.getState();
      const comments = state.commentsByIssueId['issue-102'];
      expect(comments?.status).toBe('success');
      if (comments?.status === 'success') {
        expect(comments.data).toHaveLength(1);
        expect(comments.data[0].content).toBe('Drag target zones should highlight when active.');
        expect(comments.data[0].authorName).toBe('Morgan');
      }
    });

    it('handles error when API fails', async () => {
      server.use(
        http.get('/api/issues/:id/comments', () =>
          HttpResponse.json(
            { error: { code: 'server_error', message: 'Failed to load comments' } },
            { status: 500 },
          ),
        ),
      );

      await act(async () => {
        await useIssuesStore.getState().loadComments('issue-102');
      });

      const state = useIssuesStore.getState();
      const comments = state.commentsByIssueId['issue-102'];
      expect(comments?.status).toBe('error');
      if (comments?.status === 'error') {
        expect(comments.error).toBe('Failed to load comments');
      }
    });
  });

  describe('replaceIssue', () => {
    it('replaces an existing issue in the store', async () => {
      await act(async () => {
        await useIssuesStore.getState().loadIssues('proj-falcon');
      });

      const updatedIssue = {
        id: 'issue-101',
        projectId: 'proj-falcon',
        number: 101,
        title: 'Updated title',
        description: 'Updated description',
        stage: 'TODO' as const,
        assignedAgentId: 'A-99',
        labels: [],
      };

      useIssuesStore.getState().replaceIssue(updatedIssue);

      const state = useIssuesStore.getState();
      if (state.issues.status === 'success') {
        const issue = state.issues.data.find((i) => i.id === 'issue-101');
        expect(issue?.title).toBe('Updated title');
        expect(issue?.description).toBe('Updated description');
        expect(issue?.stage).toBe('TODO');
        expect(issue?.assignedAgentId).toBe('A-99');
      }
    });

    it('does nothing if issues are not loaded', () => {
      const updatedIssue = {
        id: 'issue-101',
        projectId: 'proj-falcon',
        number: 101,
        title: 'Updated title',
        description: 'Updated description',
        stage: 'TODO' as const,
        assignedAgentId: null,
        labels: [],
      };

      useIssuesStore.getState().replaceIssue(updatedIssue);

      const state = useIssuesStore.getState();
      expect(state.issues.status).toBe('idle');
    });

    it('preserves other issues when replacing one', async () => {
      await act(async () => {
        await useIssuesStore.getState().loadIssues('proj-falcon');
      });

      const beforeState = useIssuesStore.getState();
      const beforeCount = beforeState.issues.status === 'success' ? beforeState.issues.data.length : 0;

      const updatedIssue = {
        id: 'issue-101',
        projectId: 'proj-falcon',
        number: 101,
        title: 'Updated title',
        description: 'Updated description',
        stage: 'IMPLEMENT' as const,
        assignedAgentId: null,
        labels: [],
      };

      useIssuesStore.getState().replaceIssue(updatedIssue);

      const afterState = useIssuesStore.getState();
      if (afterState.issues.status === 'success') {
        expect(afterState.issues.data.length).toBe(beforeCount);
        // Check that other issues are unchanged
        const issue102 = afterState.issues.data.find((i) => i.id === 'issue-102');
        expect(issue102?.title).toBe('Wire Kanban drag and drop');
      }
    });
  });

  describe('reset', () => {
    it('resets state to initial values', async () => {
      await act(async () => {
        await useIssuesStore.getState().loadIssues('proj-falcon');
        await useIssuesStore.getState().loadLabels('proj-falcon');
      });

      useIssuesStore.getState().reset();

      const state = useIssuesStore.getState();
      expect(state.issues.status).toBe('idle');
      expect(state.labelsByProjectId).toEqual({});
      expect(state.commentsByIssueId).toEqual({});
    });
  });

  describe('moveIssueStage WS interference', () => {
    it('does not rollback when WS updates issue during failed optimistic update', async () => {
      // First load issues
      await act(async () => {
        await useIssuesStore.getState().loadIssues('proj-falcon');
      });

      // Set up API to fail after a delay
      server.use(
        http.post('/api/issues/:id/transition', async () => {
          // Simulate network delay
          await new Promise((resolve) => setTimeout(resolve, 50));
          return HttpResponse.json(
            { error: { code: 'server_error', message: 'Server unavailable' } },
            { status: 500 },
          );
        }),
      );

      const onError = vi.fn();

      // Start the optimistic move
      const movePromise = act(async () => {
        await useIssuesStore.getState().moveIssueStage('issue-101', 'TODO', onError);
      });

      // Simulate WS event updating the issue to a different stage DURING the API call
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 20));
        // WS updates issue-101 to IMPLEMENT (different from our optimistic 'TODO')
        useIssuesStore.getState().replaceIssue({
          id: 'issue-101',
          projectId: 'proj-falcon',
          number: 101,
          title: 'Bootstrap PM dashboard shell',
          description: 'Create the initial app shell.',
          stage: 'IMPLEMENT', // WS says it's now in IMPLEMENT
          assignedAgentId: 'A-77',
          labels: [],
        });
      });

      // Wait for the move to complete (and fail)
      await movePromise;

      // Verify error callback was called
      expect(onError).toHaveBeenCalledWith('Server unavailable');

      // Verify issue is still in IMPLEMENT (WS state), NOT rolled back to BACKLOG (original)
      const state = useIssuesStore.getState();
      if (state.issues.status === 'success') {
        const issue = state.issues.data.find((i) => i.id === 'issue-101');
        expect(issue?.stage).toBe('IMPLEMENT');
      }
    });

    it('does rollback when WS has not updated the issue', async () => {
      // First load issues
      await act(async () => {
        await useIssuesStore.getState().loadIssues('proj-falcon');
      });

      // Get original stage
      const originalState = useIssuesStore.getState();
      const originalIssue = originalState.issues.status === 'success'
        ? originalState.issues.data.find((i) => i.id === 'issue-101')
        : null;
      const originalStage = originalIssue?.stage;

      // Set up API to fail
      server.use(
        http.post('/api/issues/:id/transition', () =>
          HttpResponse.json(
            { error: { code: 'invalid_transition', message: 'Invalid transition' } },
            { status: 400 },
          ),
        ),
      );

      const onError = vi.fn();

      await act(async () => {
        await useIssuesStore.getState().moveIssueStage('issue-101', 'TODO', onError);
      });

      // Verify error callback was called
      expect(onError).toHaveBeenCalledWith('Invalid transition');

      // Verify issue was rolled back to original stage
      const state = useIssuesStore.getState();
      if (state.issues.status === 'success') {
        const issue = state.issues.data.find((i) => i.id === 'issue-101');
        expect(issue?.stage).toBe(originalStage);
      }
    });
  });
});
