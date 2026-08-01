"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Profile } from "@/lib/domain/types";
import { getStorage } from "@/lib/storage/db";

/**
 * Loads profiles from IndexedDB and exposes the active one. This context is a
 * *view* of storage — every mutation goes through storage first, then updates
 * React state, so progression never lives only in memory.
 */

const ACTIVE_PROFILE_KEY = "activeProfileId";

interface ProfileContextValue {
  ready: boolean;
  profiles: Profile[];
  profile: Profile | null;
  setActiveProfile: (id: string) => Promise<void>;
  saveProfile: (profile: Profile) => Promise<void>;
  addProfile: (profile: Profile, activate?: boolean) => Promise<void>;
  removeProfile: (id: string) => Promise<void>;
  refresh: () => Promise<void>;
}

const ProfileContext = createContext<ProfileContextValue | null>(null);

export function ProfileProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const storage = getStorage();
    const list = await storage.listProfiles();
    const storedActive = await storage.getMeta(ACTIVE_PROFILE_KEY);
    setProfiles(list);
    setActiveId((current) => {
      const wanted = current ?? storedActive ?? null;
      if (wanted && list.some((p) => p.id === wanted)) return wanted;
      return list[0]?.id ?? null;
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await refresh();
      } finally {
        if (!cancelled) setReady(true);
      }
      // Background sync on app start (no-op when sync is disabled); pick up
      // whatever it merged. Failures land in sync meta, never block the app.
      const { syncNow, META_SYNC_GROUP_ID } = await import("@/lib/sync/engine");
      const enabled = await getStorage().getMeta(META_SYNC_GROUP_ID);
      if (!cancelled && enabled) {
        const ok = await syncNow(getStorage());
        if (ok && !cancelled) await refresh();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  const profile = useMemo(
    () => profiles.find((p) => p.id === activeId) ?? null,
    [profiles, activeId],
  );

  // Reflect accessibility preferences on <html> for CSS to pick up.
  // Kid mode implies larger UI.
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.largeText =
      profile?.preferences.largeText || profile?.preferences.kidMode ? "true" : "false";
    root.dataset.reduceMotion = profile?.preferences.reduceMotion ? "true" : "false";
  }, [
    profile?.preferences.largeText,
    profile?.preferences.reduceMotion,
    profile?.preferences.kidMode,
  ]);

  const setActiveProfile = useCallback(async (id: string) => {
    await getStorage().setMeta(ACTIVE_PROFILE_KEY, id);
    setActiveId(id);
  }, []);

  const saveProfile = useCallback(async (updated: Profile) => {
    // User-driven change: bump the sync timestamp (last-write-wins).
    const stamped = { ...updated, updatedAt: new Date().toISOString() };
    await getStorage().putProfile(stamped);
    setProfiles((list) => list.map((p) => (p.id === stamped.id ? stamped : p)));
  }, []);

  const addProfile = useCallback(async (created: Profile, activate = true) => {
    await getStorage().putProfile(created);
    if (activate) await getStorage().setMeta(ACTIVE_PROFILE_KEY, created.id);
    setProfiles((list) => [...list, created]);
    if (activate) setActiveId(created.id);
  }, []);

  const removeProfile = useCallback(
    async (id: string) => {
      await getStorage().deleteProfile(id);
      await refresh();
    },
    [refresh],
  );

  const value = useMemo(
    () => ({
      ready,
      profiles,
      profile,
      setActiveProfile,
      saveProfile,
      addProfile,
      removeProfile,
      refresh,
    }),
    [ready, profiles, profile, setActiveProfile, saveProfile, addProfile, removeProfile, refresh],
  );

  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>;
}

export function useProfiles(): ProfileContextValue {
  const ctx = useContext(ProfileContext);
  if (!ctx) throw new Error("useProfiles must be used inside ProfileProvider");
  return ctx;
}
