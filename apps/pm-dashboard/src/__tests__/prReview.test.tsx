import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { server } from '@/mocks/server';
import { PRReview } from '@/pages/PRReview';
import { useProjectStore } from '@/stores/projects';

describe('PRReview', () => {
  it('renders findings and updates review status', async () => {
    const reviewSpy = vi.fn();
    server.use(
      http.post('/api/findings/:id/review', async ({ params, request }) => {
        const body = (await request.json()) as { status?: string; comment?: string };
        reviewSpy({ id: params.id, ...body });
        return HttpResponse.json({
          data: {
            id: params.id,
            findingType: 'error',
            category: 'security',
            filePath: 'src/auth.ts',
            lineNumber: 42,
            message: 'Potential SQL injection',
            suggestion: 'Use parameterized queries',
            foundBy: 'claude-sonnet-4',
            confirmedBy: 'claude-opus-4.5',
            confidence: 0.95,
            status: body.status ?? 'approved',
          },
        });
      }),
    );

    await act(async () => {
      await useProjectStore.getState().loadProjects();
    });

    render(<PRReview />);

    const findingTitle = await screen.findByText('Potential SQL injection');
    const card = findingTitle.closest('article');
    if (!card) {
      throw new Error('Finding card not found');
    }

    const approveButton = within(card).getByRole('button', { name: 'Approve' });
    fireEvent.click(approveButton);

    await vi.waitFor(() => {
      expect(reviewSpy).toHaveBeenCalledWith(expect.objectContaining({ status: 'approved' }));
    });

    expect(within(card).getByText('approved')).toBeInTheDocument();
  });

  it('enables launch fixer only after pending findings reviewed', async () => {
    server.use(
      http.post('/api/findings/:id/review', async ({ params, request }) => {
        const body = (await request.json()) as { status?: string; comment?: string };
        return HttpResponse.json({
          data: {
            id: params.id,
            findingType: 'error',
            category: 'security',
            filePath: 'src/auth.ts',
            lineNumber: 42,
            message: 'Potential SQL injection',
            suggestion: 'Use parameterized queries',
            foundBy: 'claude-sonnet-4',
            confirmedBy: 'claude-opus-4.5',
            confidence: 0.95,
            status: body.status ?? 'approved',
          },
        });
      }),
    );

    await act(async () => {
      await useProjectStore.getState().loadProjects();
    });

    render(<PRReview />);

    const launchButton = await screen.findByRole('button', { name: 'Launch Fixer' });
    expect(launchButton).toBeDisabled();

    const findingTitle = await screen.findByText('Potential SQL injection');
    const card = findingTitle.closest('article');
    if (!card) {
      throw new Error('Finding card not found');
    }

    fireEvent.click(within(card).getByRole('button', { name: 'Approve' }));

    await vi.waitFor(() => {
      expect(launchButton).toBeEnabled();
    });
  });
});
