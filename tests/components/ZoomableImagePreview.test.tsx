import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import ZoomableImagePreview from '../../src/components/admin/ZoomableImagePreview';

const labels = {
  zoomIn: 'Zoom in',
  zoomOut: 'Zoom out',
  resetZoom: 'Reset zoom',
  moveTool: 'Move',
};

describe('ZoomableImagePreview', () => {
  it('zooms inside its fixed viewport and resets to 100%', () => {
    render(<ZoomableImagePreview src="data:image/png;base64,test" alt="Question preview" labels={labels} />);

    const imageContainer = screen.getByAltText('Question preview').parentElement;
    expect(imageContainer?.style.width).toBe('100%');

    fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }));
    expect(screen.getByRole('button', { name: 'Reset zoom' }).textContent).toBe('125%');
    expect(imageContainer?.style.width).toBe('125%');

    fireEvent.click(screen.getByRole('button', { name: 'Reset zoom' }));
    expect(screen.getByRole('button', { name: 'Reset zoom' }).textContent).toBe('100%');
    expect(imageContainer?.style.width).toBe('100%');
  });
});
