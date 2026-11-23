import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { travelApi } from '../api/travelApi.js';

export const useTravelList = (params) => useQuery({ queryKey: ['travel', 'list', params], queryFn: () => travelApi.list(params), placeholderData: keepPreviousData });

export const useTravel = (id) => useQuery({ queryKey: ['travel', id], queryFn: () => travelApi.get(id), enabled: !!id });

/** Invalidate everything a travel change can affect. */
export function useTravelMutation(fn, opts = {}) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    ...opts,
    onSuccess: (...args) => {
      qc.invalidateQueries({ queryKey: ['travel'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      qc.invalidateQueries({ queryKey: ['approvals'] });
      qc.invalidateQueries({ queryKey: ['notifications'] });
      opts.onSuccess?.(...args);
    },
  });
}
