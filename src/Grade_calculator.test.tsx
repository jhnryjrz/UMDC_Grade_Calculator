import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it } from 'vitest';
import GradeCalculator from './Grade_calculator';

it('updates GPA on save and restores the last deleted subject', async () => {
  const user = userEvent.setup();
  render(<GradeCalculator />);
  await user.type(screen.getByLabelText('Subject name (optional)'), 'Math');
  await user.type(screen.getByLabelText('Grade'), '3.5');
  await user.type(screen.getByLabelText('Units'), '3');
  await user.click(screen.getByRole('button', { name: 'Add subject' }));
  expect(screen.getByLabelText('Weighted GPA', { selector: 'output' })).toHaveTextContent('3.50');
  await user.click(screen.getByRole('button', { name: 'Delete Math' }));
  expect(screen.getByLabelText('Weighted GPA', { selector: 'output' })).toHaveTextContent('—');
  await user.click(screen.getByRole('button', { name: 'Undo delete' }));
  expect(screen.getByLabelText('Weighted GPA', { selector: 'output' })).toHaveTextContent('3.50');
});

it('keeps an invalid edit and the saved GPA until a valid grade is saved', async () => {
  const user = userEvent.setup();
  render(<GradeCalculator />);
  await user.type(screen.getByLabelText('Subject name (optional)'), 'Math');
  await user.type(screen.getByLabelText('Grade'), '3.5');
  await user.type(screen.getByLabelText('Units'), '3');
  await user.click(screen.getByRole('button', { name: 'Add subject' }));
  await user.click(screen.getByRole('button', { name: 'Edit Math' }));
  const row = screen.getByRole('listitem');
  await user.clear(within(row).getByLabelText('Grade'));
  await user.type(within(row).getByLabelText('Grade'), '5');
  await user.click(within(row).getByRole('button', { name: 'Save changes' }));
  expect(within(row).getByRole('alert')).toHaveTextContent('Enter a grade from 0 to 4.');
  expect(screen.getByLabelText('Weighted GPA', { selector: 'output' })).toHaveTextContent('3.50');
  await user.clear(within(row).getByLabelText('Grade'));
  await user.type(within(row).getByLabelText('Grade'), '4');
  await user.click(within(row).getByRole('button', { name: 'Save changes' }));
  expect(screen.getByLabelText('Weighted GPA', { selector: 'output' })).toHaveTextContent('4.00');
});
