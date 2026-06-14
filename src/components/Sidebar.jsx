import { useState, useEffect } from "react";
import "./Sidebar.css";
import { useServerStore } from "../store/serverStore";
import { invoke } from "@tauri-apps/api/core";

const navItems = [
  { group: "메인", items: [
    { id: "settings",    icon: "ti-server",            label: "서버 관리" },
    { id: "dashboard",   icon: "ti-layout-dashboard",  label: "대시보드" },
    { id: "controls",    icon: "ti-adjustments",       label: "서버 제어" },
    { id: "players",     icon: "ti-users",             label: "플레이어" },
    { id: "console",     icon: "ti-terminal-2",        label: "콘솔" },
  ]},
  { group: "서버 설정", items: [
    { id: "properties",  icon: "ti-file-text",         label: "서버 프로퍼티" },
    { id: "plugins",     icon: "ti-plug",              label: "플러그인" },
    { id: "mods",        icon: "ti-puzzle",            label: "모드" },
    { id: "resourcepack",icon: "ti-file-zip",          label: "리소스팩" },
    { id: "eula",        icon: "ti-license",           label: "EULA" },
    { id: "downloader",  icon: "ti-download",          label: "버킷 다운로드" },
  ]},
  { group: "시스템", items: [
    { id: "javamanager", icon: "ti-coffee",            label: "Java 관리" },
    { id: "panelopts",   icon: "ti-settings",          label: "패널 설정" },
  ]},
];

export default function Sidebar({ page, setPage }) {
  const { getActiveServer, getServerStatus, setServerStatus } = useServerStore();
  const activeServer = getActiveServer();
  const status = activeServer ? getServerStatus(activeServer.id) : "stopped";
  const [time, setTime] = useState(new Date().toLocaleTimeString("ko-KR"));

  useEffect(() => {
    const interval = setInterval(() => {
      setTime(new Date().toLocaleTimeString("ko-KR"));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  async function startServer() {
    if (!activeServer) return;
    setServerStatus(activeServer.id, "starting");
    try {
      await invoke("accept_eula", { serverDir: activeServer.serverDir });
      await invoke("start_server", {
        id: activeServer.id,
        jarPath: activeServer.jarPath,
        serverDir: activeServer.serverDir,
        ramMb: activeServer.ramMb ?? 2048,
        javaPath: activeServer.javaPath || null,
      });
    } catch (e) {
      alert("서버 시작 실패: " + e);
      setServerStatus(activeServer.id, "stopped");
    }
  }

  async function stopServer() {
    if (!activeServer) return;
    try { await invoke("stop_server", { id: activeServer.id }); }
    catch (e) { alert("정지 실패: " + e); }
  }

  return (
    <aside className="sidebar">
      <div className="sidebar-titlebar">
        <div className="sidebar-dots">
          <span className="dot red" />
          <span className="dot yellow" />
          <span className="dot green" />
        </div>
        <span className="sidebar-title">PigManager</span>
      </div>

      <nav className="sidebar-nav">
        {navItems.map(({ group, items }) => (
          <div key={group}>
            <div className="nav-group">{group}</div>
            {items.map(({ id, icon, label }) => (
              <button
                key={id}
                className={`nav-item ${page === id ? "active" : ""}`}
                onClick={() => setPage(id)}
              >
                <i className={`ti ${icon}`} />
                {label}
              </button>
            ))}
          </div>
        ))}
      </nav>

      <div className="sidebar-bottom">
        <div className="server-chip">
          <div className="chip-top">
            <div className="chip-name">
              {activeServer ? (
                <>
                  <span className={`chip-dot ${status === "running" ? "online" : ""}`} />
                  {activeServer.name}
                </>
              ) : (
                <span style={{ color: "var(--text3)", fontSize: 12, cursor: "pointer" }}
                  onClick={() => setPage("settings")}
                >
                  <i className="ti ti-plus" style={{ fontSize: 11 }} /> 서버 추가하기
                </span>
              )}
            </div>
            {activeServer && (
              <div className="chip-btns">
                {status === "running" || status === "stopping" ? (
                  <button
                    className="chip-btn stop"
                    title="정지"
                    onClick={stopServer}
                    disabled={status === "stopping"}
                  >
                    <i className="ti ti-player-stop" />
                  </button>
                ) : (
                  <button
                    className="chip-btn start"
                    title="시작"
                    onClick={startServer}
                    disabled={status === "starting"}
                  >
                    <i className="ti ti-player-play" />
                  </button>
                )}
              </div>
            )}
          </div>
          <div className="chip-time">{time}</div>
        </div>
      </div>
    </aside>
  );
}
