import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useServerStore } from "../store/serverStore";
import "./Console.css";

export default function Console() {
  const { getActiveServer, getServerLogs, clearLogs, getServerStatus } = useServerStore();
  const server = getActiveServer();
  const status = server ? getServerStatus(server.id) : "stopped";
  const logs = server ? getServerLogs(server.id) : [];
  const [cmd, setCmd] = useState("");
  const [history, setHistory] = useState([]);
  const [historyIdx, setHistoryIdx] = useState(-1);
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "auto" });
  }, [logs.length]);

  async function sendCmd() {
    const trimmed = cmd.trim();
    if (!trimmed || !server) return;
    try {
      await invoke("send_command", { id: server.id, command: trimmed });
      setHistory((h) => [trimmed, ...h.slice(0, 49)]);
      setHistoryIdx(-1);
      setCmd("");
    } catch (e) {
      alert("명령어 전송 실패: " + e);
    }
  }

  function handleKeyDown(e) {
    if (e.key === "Enter") { sendCmd(); return; }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      const idx = Math.min(historyIdx + 1, history.length - 1);
      setHistoryIdx(idx);
      setCmd(history[idx] ?? "");
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      const idx = Math.max(historyIdx - 1, -1);
      setHistoryIdx(idx);
      setCmd(idx === -1 ? "" : history[idx]);
    }
  }

  const canSend = !!server && status === "running";

  return (
    <div className="page">
      <div className="topbar">
        <h1 className="page-title">콘솔</h1>
        <div className="topbar-right">
          <button className="btn" onClick={() => server && clearLogs(server.id)} disabled={!server}>
            <i className="ti ti-trash" /> 지우기
          </button>
        </div>
      </div>
      <div className="console-wrap">
        <div className="console-body">
          {logs.length === 0
            ? <div className="console-empty">서버를 시작하면 로그가 여기 표시돼요</div>
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
            placeholder={canSend ? "명령어 입력... (↑↓ 히스토리)" : "서버가 실행 중이어야 해요"}
            value={cmd}
            disabled={!canSend}
            onChange={(e) => setCmd(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <button className="btn btn-primary" onClick={sendCmd} disabled={!canSend || !cmd.trim()}>
            <i className="ti ti-send" /> 전송
          </button>
        </div>
      </div>
    </div>
  );
}
