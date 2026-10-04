import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import ImportDialog from './ImportDialog';
import { scanScreenshots } from './scanner';

vi.mock('./scanner', async importOriginal => {
  const real = await importOriginal<typeof import('./scanner')>();
  return { ...real, scanScreenshots: vi.fn() };
});

it('reviews scanned subjects before committing them', async () => {
  const user = userEvent.setup();
  const onConfirm = vi.fn();
  vi.mocked(scanScreenshots).mockResolvedValue([{ code: 'MATH1', subject: 'Math', grade: 3.5, unit: 3 }]);
  render(<ImportDialog existing={[]} onConfirm={onConfirm} onClose={vi.fn()} />);
  await user.upload(screen.getByLabelText('Grade screenshots'), new File(['image'], 'grades.png', { type: 'image/png' }));
  await user.type(screen.getByLabelText('Google AI API key'), 'test-key');
  await user.click(screen.getByRole('button', { name: 'Scan screenshots' }));
  await screen.findByRole('button', { name: 'Add 1 subject' });
  expect(onConfirm).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: 'Add 1 subject' }));
  expect(onConfirm).toHaveBeenCalledTimes(1);
  expect(onConfirm.mock.calls[0][0][0]).toMatchObject({
    name: 'Math', code: 'MATH1', grade: 3.5, unit: 3, source: 'scan',
  });
});

it('ignores a late scan result after closing', async () => {
  const user = userEvent.setup();
  const onConfirm = vi.fn(), onClose = vi.fn();
  let finish!: (rows: { grade: number; unit: number }[]) => void;
  vi.mocked(scanScreenshots).mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  render(<ImportDialog existing={[]} onConfirm={onConfirm} onClose={onClose} />);
  await user.upload(screen.getByLabelText('Grade screenshots'), new File(['image'], 'grades.png', { type: 'image/png' }));
  await user.type(screen.getByLabelText('Google AI API key'), 'test-key');
  await user.click(screen.getByRole('button', { name: 'Scan screenshots' }));
  await user.click(screen.getByRole('button', { name: 'Close import' }));
  finish([{ grade: 4, unit: 3 }]);
  expect(onClose).toHaveBeenCalledOnce();
  expect(onConfirm).not.toHaveBeenCalled();
});
