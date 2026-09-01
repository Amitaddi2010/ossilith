import { create } from 'zustand';
import { fetchLicenseStatus, activateLicense, startEvaluationTrial, fetchHardwareId, LicenseStatus } from '@/lib/api';

interface LicenseState {
  status: LicenseStatus | null;
  hwid: string | null;
  isLoading: boolean;
  isActivating: boolean;
  error: string | null;
  isModalOpen: boolean;

  openModal: () => void;
  closeModal: () => void;
  loadLicense: () => Promise<void>;
  activate: (key: string) => Promise<boolean>;
  startTrial: (name?: string) => Promise<boolean>;
}

export const useLicenseStore = create<LicenseState>((set, get) => ({
  status: null,
  hwid: null,
  isLoading: false,
  isActivating: false,
  error: null,
  isModalOpen: false,

  openModal: () => set({ isModalOpen: true, error: null }),
  closeModal: () => set({ isModalOpen: false, error: null }),

  loadLicense: async () => {
    set({ isLoading: true, error: null });
    try {
      const [status, hwidRes] = await Promise.all([
        fetchLicenseStatus(),
        fetchHardwareId().catch(() => ({ hwid: '' })),
      ]);
      set({ status, hwid: hwidRes.hwid || status.hwid, isLoading: false });
    } catch (err: any) {
      set({ error: err.message || 'Failed to load license info', isLoading: false });
    }
  },

  activate: async (key: string) => {
    set({ isActivating: true, error: null });
    try {
      const status = await activateLicense(key);
      set({ status, isActivating: false, isModalOpen: false });
      return true;
    } catch (err: any) {
      set({ error: err.message || 'License activation failed. Invalid signature or HWID.', isActivating: false });
      return false;
    }
  },

  startTrial: async (name?: string) => {
    set({ isActivating: true, error: null });
    try {
      const status = await startEvaluationTrial(name);
      set({ status, isActivating: false, isModalOpen: false });
      return true;
    } catch (err: any) {
      set({ error: err.message || 'Failed to initialize trial evaluation.', isActivating: false });
      return false;
    }
  },
}));
