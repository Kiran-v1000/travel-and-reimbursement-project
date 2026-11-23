import { useInfiniteQuery } from '@tanstack/react-query';

/**
 * "Load more" pagination over endpoints returning { items, total, page, pageSize }.
 * Flattens pages and exposes totals so long lists stay fast at any company size.
 */
export function usePaged(queryKey, fetchPage, { pageSize = 50, enabled = true } = {}) {
  const q = useInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam }) => fetchPage({ page: pageParam, pageSize }),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.page * last.pageSize < last.total ? last.page + 1 : undefined),
    enabled,
  });
  const first = q.data?.pages[0];
  return {
    ...q,
    items: q.data?.pages.flatMap((p) => p.items) ?? [],
    total: first?.total ?? 0,
    amount: first?.amount ?? 0,
    counts: first?.counts ?? {},
  };
}
