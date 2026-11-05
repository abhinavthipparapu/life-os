import { configureStore, createSlice, type PayloadAction } from "@reduxjs/toolkit";
import { useDispatch, useSelector } from "react-redux";
import { api } from "./api";

export interface Celebration {
  dayComplete: boolean;
  plannerCompleted: { id: string; name: string } | null;
  achievements: { key: string; title: string; description: string; icon: string }[];
}

interface UiState {
  online: boolean;
  syncing: boolean;
  pendingCount: number;
  conflicts: { clientOperationId: string; current: { id: string; status: string; version: number } }[];
  celebration: Celebration | null;
}

const initialState: UiState = {
  online: typeof navigator === "undefined" ? true : navigator.onLine,
  syncing: false,
  pendingCount: 0,
  conflicts: [],
  celebration: null,
};

// Ephemeral cross-feature state only. Server data belongs to RTK Query.
export const ui = createSlice({
  name: "ui",
  initialState,
  reducers: {
    setOnline: (s, a: PayloadAction<boolean>) => void (s.online = a.payload),
    setSyncing: (s, a: PayloadAction<boolean>) => void (s.syncing = a.payload),
    setPendingCount: (s, a: PayloadAction<number>) => void (s.pendingCount = a.payload),
    setConflicts: (s, a: PayloadAction<UiState["conflicts"]>) => void (s.conflicts = a.payload),
    celebrate: (s, a: PayloadAction<Celebration | null>) => void (s.celebration = a.payload),
  },
});

export const store = configureStore({
  reducer: { [api.reducerPath]: api.reducer, ui: ui.reducer },
  middleware: (getDefault) => getDefault().concat(api.middleware),
});

export type RootState = ReturnType<typeof store.getState>;
export const useAppDispatch = useDispatch.withTypes<typeof store.dispatch>();
export const useAppSelector = useSelector.withTypes<RootState>();
