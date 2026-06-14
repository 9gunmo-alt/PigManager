import { create } from "zustand";
import { persist } from "zustand/middleware";

export const useServerStore = create(
  persist(
    (set, get) => ({
      servers: [],
      activeServerId: null,
      runningServers: {},
      logs: {},
      players: {},
      opLists: {},
      banLists: {},
      joinHistory: {},
      tpsMap: {},

      addServer: (server) => {
        const id = crypto.randomUUID();
        const newServer = { id, ...server, createdAt: Date.now() };
        set((s) => ({ servers: [...s.servers, newServer] }));
        return id;
      },

      updateServer: (id, data) =>
        set((s) => ({
          servers: s.servers.map((sv) => (sv.id === id ? { ...sv, ...data } : sv)),
        })),

      removeServer: (id) =>
        set((s) => ({
          servers: s.servers.filter((sv) => sv.id !== id),
          activeServerId: s.activeServerId === id ? null : s.activeServerId,
        })),

      setActiveServer: (id) => set({ activeServerId: id }),

      setServerStatus: (id, status) =>
        set((s) => ({ runningServers: { ...s.runningServers, [id]: status } })),

      addLog: (serverId, entry) =>
        set((s) => ({
          logs: {
            ...s.logs,
            [serverId]: [...(s.logs[serverId] ?? []).slice(-999), entry],
          },
        })),

      clearLogs: (serverId) =>
        set((s) => ({ logs: { ...s.logs, [serverId]: [] } })),

      setTps: (serverId, tps) =>
        set((s) => ({ tpsMap: { ...s.tpsMap, [serverId]: tps } })),

      getTps: (serverId) => get().tpsMap[serverId],

      getActiveServer: () => {
        const { servers, activeServerId } = get();
        return servers.find((s) => s.id === activeServerId) ?? null;
      },

      getServerStatus: (id) => get().runningServers[id] ?? "stopped",
      getServerLogs: (id) => get().logs[id] ?? [],

      addPlayer: (serverId, player) =>
        set((s) => {
          const current = s.players[serverId] ?? [];
          if (current.find((p) => p.name === player.name)) return s;

          const history = s.joinHistory[serverId] ?? [];
          const newEntry = {
            name: player.name,
            joinedAt: player.joinedAt,
            leftAt: null,
          };

          return {
            players: {
              ...s.players,
              [serverId]: [...current, player],
            },
            joinHistory: {
              ...s.joinHistory,
              [serverId]: [newEntry, ...history].slice(0, 500),
            },
          };
        }),

      removePlayer: (serverId, name) =>
        set((s) => {
          const history = (s.joinHistory[serverId] ?? []).map((h) =>
            h.name === name && h.leftAt === null
              ? { ...h, leftAt: Date.now() }
              : h
          );
          return {
            players: {
              ...s.players,
              [serverId]: (s.players[serverId] ?? []).filter((p) => p.name !== name),
            },
            joinHistory: {
              ...s.joinHistory,
              [serverId]: history,
            },
          };
        }),

      clearPlayers: (serverId) =>
        set((s) => {
          const now = Date.now();
          const history = (s.joinHistory[serverId] ?? []).map((h) =>
            h.leftAt === null ? { ...h, leftAt: now } : h
          );
          return {
            players: { ...s.players, [serverId]: [] },
            joinHistory: { ...s.joinHistory, [serverId]: history },
          };
        }),

      getPlayers: (serverId) => get().players[serverId] ?? [],
      getJoinHistory: (serverId) => get().joinHistory[serverId] ?? [],

      clearJoinHistory: (serverId) =>
        set((s) => ({ joinHistory: { ...s.joinHistory, [serverId]: [] } })),

      // OP 관련
      getOpList: (serverId) => get().opLists[serverId] ?? [],

      addOp: (serverId, name) =>
        set((s) => {
          const current = s.opLists[serverId] ?? [];
          if (current.includes(name)) return s;
          return { opLists: { ...s.opLists, [serverId]: [...current, name] } };
        }),

      removeOp: (serverId, name) =>
        set((s) => ({
          opLists: {
            ...s.opLists,
            [serverId]: (s.opLists[serverId] ?? []).filter((n) => n !== name),
          },
        })),

      // 밴 관련
      getBanList: (serverId) => get().banLists[serverId] ?? [],

      addBan: (serverId, name) =>
        set((s) => {
          const current = s.banLists[serverId] ?? [];
          if (current.includes(name)) return s;
          return { banLists: { ...s.banLists, [serverId]: [...current, name] } };
        }),

      removeBan: (serverId, name) =>
        set((s) => ({
          banLists: {
            ...s.banLists,
            [serverId]: (s.banLists[serverId] ?? []).filter((n) => n !== name),
          },
        })),
    }),
    {
      name: "mc-panel-servers",
      partialize: (s) => ({
        servers: s.servers,
        activeServerId: s.activeServerId,
        opLists: s.opLists,
        banLists: s.banLists,
        joinHistory: s.joinHistory,
      }),
    }
  )
);
