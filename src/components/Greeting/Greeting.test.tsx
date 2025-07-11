import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { Greeting } from './Greeting';

describe('Greeting Component', () => {
  it('should render the correct greeting message', () => {
    // Arrange: Render the component with a specific prop
    render(<Greeting name="World" />);

    // Act: Find the element on the screen
    const headingElement = screen.getByRole('heading', { name: /hello, world/i });

    // Assert: Verify the element is present in the document
    expect(headingElement).toBeInTheDocument();
  });
});
