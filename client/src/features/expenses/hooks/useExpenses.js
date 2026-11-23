import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { expensesApi } from '../api/expensesApi.js';

export const useExpenseList = (params) => useQuery({ queryKey: ['expenses', 'list', params], queryFn: () => expensesApi.list(params), placeholderData: keepPreviousData });

export const useExpense = (id) => useQuery({ queryKey: ['expenses', id], queryFn: () => expensesApi.get(id), enabled: !!id });

export const useExpensePolicy = (id, enabled) =>
  useQuery({ queryKey: ['expenses', id, 'policy'], queryFn: () => expensesApi.policy(id), enabled: !!id && enabled });

export function useExpenseMutation(fn, opts = {}) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    ...opts,
    onSuccess: (...args) => {
      ['expenses', 'dashboard', 'approvals', 'notifications', 'finance'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
      opts.onSuccess?.(...args);
    },
  });
}
