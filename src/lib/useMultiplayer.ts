import { useEffect, useState, useSyncExternalStore } from "react";
import { MultiplayerClient, resolvePartyHost } from "./multiplayer";
import type { Profile } from "./storage";

export function useMultiplayer(profile: Profile) {
  const [client] = useState(() => new MultiplayerClient(profile, resolvePartyHost(
    import.meta.env.VITE_PARTYKIT_HOST,
    import.meta.env.DEV,
    window.location,
  )));
  const state = useSyncExternalStore(client.subscribe, client.getSnapshot, client.getSnapshot);
  useEffect(() => { client.setProfile(profile); }, [client, profile]);
  useEffect(() => {
    const updateConnection = () => client.setOnline(navigator.onLine);
    updateConnection();
    window.addEventListener('online', updateConnection);
    window.addEventListener('offline', updateConnection);
    client.resume();
    return () => {
      window.removeEventListener('online', updateConnection);
      window.removeEventListener('offline', updateConnection);
      client.suspend();
    };
  }, [client]);
  return {
    ...state,
    createRoom: client.createRoom,
    joinRoom: client.joinRoom,
    ready: client.ready,
    move: client.move,
    surrender: client.surrender,
    rematch: client.rematch,
    leave: client.leave,
    retry: client.retry,
  };
}
