import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { useThemeStore } from "./store/themeStore";
import { useServerStore } from "./store/serverStore";
import Sidebar from "./components/Sidebar";
import Dashboard from "./pages/Dashboard";
import Players from "./pages/Players";
import Settings from "./pages/Settings";
import PanelOpts from "./pages/PanelOpts";
import Plugins from "./pages/Plugins";
import Mods from "./pages/Mods";
import Properties from "./pages/Properties";
import Controls from "./pages/Controls";
import "./App.css";
import Eula from "./pages/Eula";
import Console from "./pages/Console";
import Downloader from "./pages/Downloader";
import ResourcePack from "./pages/ResourcePack";
import JavaManager from "./pages/JavaManager";

export default function App() {
  const { theme } = useThemeStore();
  const [page, setPage] = useState("dashboard");

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  // 전역 이벤트 리스너 — 모든 서버 로그/상태/TPS를 store 한 곳에서 관리
  useEffect(() => {
    const {
      addLog, setServerStatus, addPlayer, removePlayer, clearPlayers, setTps,
    } = useServerStore.getState();

    const unlistenLog = listen("server-log", (e) => {
      const { id, line, level } = e.payload;
      if (!id) return;

      const text = line ?? "";

      // tps 명령 응답 라인은 콘솔 로그에서 숨김 (대시보드가 10초마다 자동 호출하기 때문)
      const isTpsLine = /tps from last|tps:/i.test(text);
      if (!isTpsLine) {
        addLog(id, {
          line,
          level,
          time: new Date().toTimeString().slice(0, 8),
        });
      }

      const joinPatterns = [
        /(\w+) joined the game/,
        /(\w+)\[.*?\] logged in/,
        /(\w+) has connected/,
      ];
      for (const pattern of joinPatterns) {
        const match = text.match(pattern);
        if (match) {
          addPlayer(id, { name: match[1], joinedAt: Date.now(), ping: 0 });
          break;
        }
      }

      const leavePatterns = [
        /(\w+) left the game/,
        /(\w+) lost connection:/,
        /(\w+) has disconnected/,
      ];
      for (const pattern of leavePatterns) {
        const match = text.match(pattern);
        if (match) {
          removePlayer(id, match[1]);
          break;
        }
      }
    });

    const unlistenStatus = listen("server-status", (e) => {
      const { id, status } = e.payload;
      setServerStatus(id, status);
      if (status === "stopped") {
        clearPlayers(id);
        setTps(id, undefined);
      }
    });

    const unlistenTps = listen("server-tps", (e) => {
      const { id, tps } = e.payload;
      setTps(id, tps);
    });

    return () => {
      unlistenLog.then((f) => f());
      unlistenStatus.then((f) => f());
      unlistenTps.then((f) => f());
    };
  }, []);

  const pages = {
    dashboard:    <Dashboard />,
    players:      <Players />,
    settings:     <Settings />,
    panelopts:    <PanelOpts />,
    plugins:      <Plugins />,
    mods:         <Mods />,
    properties:   <Properties />,
    controls:     <Controls />,
    eula:         <Eula />,
    console:      <Console />,
    downloader:   <Downloader />,
    resourcepack: <ResourcePack />,
    javamanager:  <JavaManager />,
  };

  return (
    <div className="app-layout">
      <Sidebar page={page} setPage={setPage} />
      <main className="app-main">
        {pages[page] ?? <Dashboard />}
      </main>
    </div>
  );
}
