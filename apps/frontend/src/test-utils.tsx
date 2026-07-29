import { useState, type ReactElement, type ReactNode } from 'react';
import { render } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

export function TestProviders({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { retry: false },
          mutations: { retry: false },
        },
      }),
  );

  return (
    <MantineProvider>
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </MantineProvider>
  );
}

export function renderWithProviders(ui: ReactElement) {
  return render(ui, { wrapper: TestProviders });
}
