/**
 * Zustand store for case management — current case, list, CRUD.
 */

import { create } from 'zustand';
import * as api from '@/lib/api';

interface CaseStore {
  cases: api.Case[];
  currentCase: api.Case | null;
  loading: boolean;
  error: string | null;

  // Actions
  fetchCases: () => Promise<void>;
  fetchCase: (id: string) => Promise<void>;
  createCase: (name: string, description?: string) => Promise<api.Case>;
  deleteCase: (id: string) => Promise<void>;
  clearError: () => void;
}

export const useCaseStore = create<CaseStore>((set, get) => ({
  cases: [],
  currentCase: null,
  loading: false,
  error: null,

  fetchCases: async () => {
    set({ loading: true, error: null });
    try {
      const res = await api.listCases();
      set({ cases: res?.cases || [], loading: false });
    } catch (e) {
      set({ error: (e as Error).message, loading: false });
    } finally {
      set({ loading: false });
    }
  },

  fetchCase: async (id: string) => {
    set({ loading: true, error: null });
    try {
      const c = await api.getCase(id);
      set({ currentCase: c, loading: false });
    } catch (e) {
      set({ error: (e as Error).message, loading: false });
    } finally {
      set({ loading: false });
    }
  },


  createCase: async (name: string, description?: string) => {
    set({ loading: true, error: null });
    try {
      const c = await api.createCase({ name, description });
      set((state) => ({
        cases: [c, ...state.cases],
        loading: false,
      }));
      return c;
    } catch (e) {
      set({ error: (e as Error).message, loading: false });
      throw e;
    }
  },

  deleteCase: async (id: string) => {
    try {
      await api.deleteCase(id);
      set((state) => ({
        cases: state.cases.filter((c) => c.id !== id),
        currentCase: state.currentCase?.id === id ? null : state.currentCase,
      }));
    } catch (e) {
      set({ error: (e as Error).message });
    }
  },

  clearError: () => set({ error: null }),
}));
