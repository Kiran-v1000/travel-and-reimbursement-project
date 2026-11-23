import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MotionConfig } from 'framer-motion';
import { Toaster } from 'sonner';
import { useAppStore } from './store.js';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 20_000, retry: (n, err) => n < 2 && ![401, 403, 404].includes(err?.status), refetchOnWindowFocus: true },
    mutations: { retry: 0 },
  },
});

export function Providers({ children }) {
  const theme = useAppStore((s) => s.theme);
  return (
    <QueryClientProvider client={queryClient}>
      <MotionConfig reducedMotion="user">
        {children}
        <Toaster position="bottom-right" theme={theme} richColors closeButton duration={4500} toastOptions={{ style: { borderRadius: 14, fontFamily: 'inherit' } }} />
      </MotionConfig>
    </QueryClientProvider>
  );
}
