import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useServerStore } from "../store/serverStore";
import "./Dashboard.css";

export default function Dashboard() {
  const {
    getActiveServer, getServerStatus, setServerStatus,
    getServerLogs, clearLogs, getPlayers, getTps,
  } = useServerStore();
  const server = getActiveServer();
  const status = server ? getServerStatus(server.id) : "stopped";
  const logs = server ? getServerLogs(server.id) : [];
  const players = server ? getPlayers(server.id) : [];
  const tps = server ? getTps(server.id) : undefined;
  const [cmd, setCmd] = useState("");
  const [cmdHistory, setCmdHistory] = useState([]);
  const [historyIdx, setHistoryIdx] = useState(-1);
  const [stats, setStats] = useState({ ram_used_gb: "—", ram_total_gb: "—", ram_percent: 0, cpu_percent: 0 });
  const bottomRef = useRef(null);

  useEffect(() => {
    let alive = true;
    async function fetchStats() {
      try {
        const s = await invoke("get_system_stats");
        if (alive) setStats(s);
      } catch {}
    }
    fetchStats();
    const interval = setInterval(fetchStats, 2000);
    return () => { alive = false; clearInterval(interval); };
  }, []);

  // 서버 실행 중이면 주기적으로 tps 명령 전송 (Paper/Purpur가 응답 → 로그 파싱)
  useEffect(() => {
    if (!server || status !== "running") return;
    let alive = true;
    async function pollTps() {
      try { await invoke("send_command", { id: server.id, command: "tps" }); }
      catch {}
    }
    const t = setInterval(() => { if (alive) pollTps(); }, 10000);
    return () => { alive = false; clearInterval(t); };
  }, [server?.id, status]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "auto" });
  }, [logs.length]);

  async function startServer() {
    if (!server) return;
    setServerStatus(server.id, "starting");
    try {
      await invoke("accept_eula", { serverDir: server.serverDir });
      await invoke("start_server", {
        id: server.id,
        jarPath: server.jarPath,
        serverDir: server.serverDir,
        ramMb: server.ramMb ?? 2048,
        javaPath: server.javaPath || null,
      });
    } catch (e) {
      alert("서버 시작 실패: " + e);
      setServerStatus(server.id, "stopped");
    }
  }

  async function stopServer() {
    if (!server) return;
    try { await invoke("stop_server", { id: server.id }); }
    catch (e) { alert("정지 실패: " + e); }
  }

  // 재시작: 정지 후 서버가 완전히 종료될 때까지 기다렸다 다시 시작
  async function restartServer() {
    if (!server) return;
    try {
      await invoke("stop_server", { id: server.id });
    } catch (e) {
      alert("정지 실패: " + e);
      return;
    }
    // 종료 폴링 (최대 30초 대기)
    let waited = 0;
    const poll = setInterval(async () => {
      waited += 1000;
      let running = true;
      try { running = await invoke("is_server_running", { id: server.id }); }
      catch { running = false; }
      if (!running || waited >= 30000) {
        clearInterval(poll);
        setTimeout(() => startServer(), 1000);
      }
    }, 1000);
  }

  async function sendCmd() {
    const trimmed = cmd.trim();
    if (!trimmed || !server) return;
    try {
      await invoke("send_command", { id: server.id, command: trimmed });
      setCmdHistory((h) => [trimmed, ...h.slice(0, 49)]);
      setHistoryIdx(-1);
      setCmd("");
    } catch (e) { alert("명령어 전송 실패: " + e); }
  }

  function handleKeyDown(e) {
    if (e.key === "Enter") { sendCmd(); return; }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      const idx = Math.min(historyIdx + 1, cmdHistory.length - 1);
      setHistoryIdx(idx);
      setCmd(cmdHistory[idx] ?? "");
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      const idx = Math.max(historyIdx - 1, -1);
      setHistoryIdx(idx);
      setCmd(idx === -1 ? "" : cmdHistory[idx]);
    }
  }

  const statusLabel = { running: "온라인", stopped: "오프라인", starting: "시작 중", stopping: "정지 중" };
  const statusClass = { running: "online", stopped: "offline", starting: "starting", stopping: "stopping" };
  const ramPercent = stats.ram_percent ?? 0;
  const cpuPercent = stats.cpu_percent ?? 0;
  const playerCount = players.length;
  const tpsDisplay = (status === "running" && typeof tps === "number") ? tps.toFixed(1) : "—";
  const tpsClass = tpsDisplay === "—" || parseFloat(tpsDisplay) >= 19 ? "green"
    : parseFloat(tpsDisplay) >= 15 ? "amber" : "red";

  return (
    <div className="page">
      <div className="topbar">
        <div className="topbar-left">
          {server?.image
            ? <img src={server.image} className="server-thumb" alt="" />
            : <div className="server-thumb-placeholder"><i className="ti ti-server" /></div>
          }
          <div>
            <h1 className="page-title">{server?.name ?? "서버 없음"}</h1>
            <span className={`status-badge ${statusClass[status] ?? "offline"}`}>
              <span className="status-dot" />
              {statusLabel[status] ?? "오프라인"}
            </span>
          </div>
        </div>
        <div className="topbar-right">
          {!server && <span className="no-server-hint">서버 관리에서 서버를 먼저 추가해주세요</span>}
          <button className="btn btn-green" onClick={startServer}
            disabled={!server || status === "running" || status === "starting"}>
            <i className="ti ti-player-play" /><span>시작</span>
          </button>
          <button className="btn btn-amber" onClick={restartServer}
            disabled={!server || status !== "running"}>
            <i className="ti ti-refresh" /><span>재시작</span>
          </button>
          <button className="btn btn-red" onClick={stopServer}
            disabled={!server || status === "stopped" || status === "stopping"}>
            <i className="ti ti-player-stop" /><span>정지</span>
          </button>
        </div>
      </div>

      <div className="dashboard-content">
        <div className="stat-grid">
          <div className="stat-card">
            <div className="stat-label">플레이어</div>
            <div className="stat-value green">
              {playerCount}<span className="stat-max">/20</span>
            </div>
            <div className="stat-sub">현재 접속</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">RAM</div>
            <div className="stat-value amber">
              {stats.ram_used_gb}<span className="stat-max">/{stats.ram_total_gb}GB</span>
            </div>
            <div className="stat-sub">
              <div className="stat-bar">
                <div className="stat-bar-fill amber" style={{ width: `${ramPercent}%` }} />
              </div>
              {ramPercent}% 사용 중
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-label">CPU</div>
            <div className="stat-value blue">
              {cpuPercent}<span className="stat-max">%</span>
            </div>
            <div className="stat-sub">
              <div className="stat-bar">
                <div className="stat-bar-fill blue" style={{ width: `${cpuPercent}%` }} />
              </div>
              시스템 전체
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-label">TPS</div>
            <div className={`stat-value ${tpsClass}`}>
              {tpsDisplay}
            </div>
            <div className="stat-sub">
              {status === "running" ? "목표 20.0" : "서버 정지됨"}
            </div>
          </div>
        </div>

        <div className="lower-grid">
          <div className="panel console-panel">
            <div className="panel-header">
              <i className="ti ti-terminal-2" />콘솔
              <button className="clear-btn" onClick={() => server && clearLogs(server.id)}>
                <i className="ti ti-trash" />
              </button>
            </div>
            <div className="console-body">
              {logs.length === 0
                ? <div className="console-empty">서버를 시작하면 로그가 표시돼요</div>
                : logs.map((l, i) => (
                  <div key={i} className="console-row">
                    <span className="c-time">{l.time}</span>
                    <span className={`c-level ${l.level?.toLowerCase()}`}>[{l.level}]</span>
                    <span className="c-msg">{l.line}</span>
                  </div>
                ))
              }
              <div ref={bottomRef} />
            </div>
            <div className="console-input-row">
              <span className="console-prompt">&gt;</span>
              <input
                className="console-input"
                placeholder={status === "running" ? "명령어 입력... (↑↓ 히스토리)" : "서버가 실행 중이어야 해요"}
                value={cmd}
                disabled={status !== "running"}
                onChange={(e) => setCmd(e.target.value)}
                onKeyDown={handleKeyDown}
              />
              <button className="btn btn-primary send-btn" onClick={sendCmd}
                disabled={status !== "running" || !cmd.trim()}>
                <i className="ti ti-send" /> 전송
              </button>
            </div>
          </div>

          <div className="panel">
            <div className="panel-header"><i className="ti ti-server" />서버 정보</div>
            <div className="server-info-body">
              {server ? (
                <table className="info-table">
                  <tbody>
                    <tr><td>이름</td><td>{server.name}</td></tr>
                    <tr><td>버전</td><td>{server.version || "미설정"}</td></tr>
                    <tr><td>경로</td><td className="path-cell">{server.serverDir}</td></tr>
                    <tr><td>JAR</td><td className="path-cell">{server.jarPath}</td></tr>
                    <tr><td>RAM</td><td>{server.ramMb ?? 2048} MB</td></tr>
                    <tr><td>포트</td><td>{server.port || "25565"}</td></tr>
                  </tbody>
                </table>
              ) : (
                <div className="no-server">
                  <i className="ti ti-server-off" />
                  <p>서버 관리에서 서버를 추가해주세요</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
