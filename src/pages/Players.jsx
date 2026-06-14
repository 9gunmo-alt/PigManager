import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useServerStore } from "../store/serverStore";
import "./Players.css";

function SkinAvatar({ name, size = 40 }) {
  const [errCount, setErrCount] = useState(0);
  // 여러 API 순서대로 시도
  const apis = [
    `https://mc-heads.net/avatar/${name}/${size}`,
    `https://minotar.net/avatar/${name}/${size}`,
    `https://crafatar.com/avatars/${name}?size=${size}&overlay`,
  ];
  const url = errCount < apis.length ? apis[errCount] : null;

  if (!url) {
    return (
      <div className="player-avatar" style={{ background: nameToColor(name), width: size, height: size }}>
        {name.slice(0, 1).toUpperCase()}
      </div>
    );
  }
  return (
    <img src={url} alt={name} width={size} height={size}
      className="player-avatar skin-avatar"
      onError={() => setErrCount(c => c + 1)}
      style={{ borderRadius: 8, imageRendering: "pixelated" }}
    />
  );
}

function nameToColor(name) {
  const colors = [
    "#1a4228", "#2d2100", "#0d2140", "#1e1535",
    "#3d1515", "#102a35", "#1a2d00", "#2d1525",
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

function formatDate(ts) {
  if (!ts) return "—";
  const d = new Date(ts);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function formatDuration(joinedAt, leftAt) {
  const ms = (leftAt ?? Date.now()) - joinedAt;
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}시간 ${m}분`;
  if (m > 0) return `${m}분 ${s}초`;
  return `${s}초`;
}

export default function Players() {
  const {
    getActiveServer, getServerStatus, clearPlayers, getPlayers,
    getOpList, addOp, removeOp,
    getBanList, addBan, removeBan,
    getJoinHistory, clearJoinHistory,
  } = useServerStore();
  const server = getActiveServer();
  const status = server ? getServerStatus(server.id) : "stopped";
  const players = server ? getPlayers(server.id) : [];
  const opList = server ? getOpList(server.id) : [];
  const banList = server ? getBanList(server.id) : [];
  const history = server ? getJoinHistory(server.id) : [];
  const [tab, setTab] = useState("online");
  const [newOp, setNewOp] = useState("");
  const [newBan, setNewBan] = useState("");
  const [historySearch, setHistorySearch] = useState("");

  useEffect(() => {
    if (status === "stopped" && server?.id) clearPlayers(server.id);
  }, [status]);

  async function runCmd(cmd) {
    if (!server || status !== "running") {
      alert("서버가 실행 중이어야 해요!"); return;
    }
    try {
      await invoke("send_command", { id: server.id, command: cmd });
    } catch (e) { alert("명령어 실패: " + e); }
  }

  async function toggleOp(name) {
    const isOp = opList.includes(name);
    await runCmd(isOp ? `deop ${name}` : `op ${name}`);
    if (isOp) removeOp(server.id, name);
    else addOp(server.id, name);
  }

  async function handleAddOp() {
    if (!newOp.trim()) return;
    await runCmd(`op ${newOp.trim()}`);
    addOp(server.id, newOp.trim());
    setNewOp("");
  }

  async function handleRemoveOp(name) {
    await runCmd(`deop ${name}`);
    removeOp(server.id, name);
  }

  async function handleAddBan() {
    if (!newBan.trim()) return;
    await runCmd(`ban ${newBan.trim()}`);
    addBan(server.id, newBan.trim());
    setNewBan("");
  }

  async function handleRemoveBan(name) {
    await runCmd(`pardon ${name}`);
    removeBan(server.id, name);
  }

  function pingColor(ping) {
    if (ping === 0) return "gray";
    if (ping < 50)  return "green";
    if (ping < 120) return "amber";
    return "red";
  }

  function elapsed(ts) {
    const m = Math.floor((Date.now() - ts) / 60000);
    return m < 1 ? "방금" : `${m}분 전`;
  }

  const filteredHistory = history.filter(h =>
    h.name.toLowerCase().includes(historySearch.toLowerCase())
  );

  return (
    <div className="page">
      <div className="topbar">
        <h1 className="page-title">플레이어</h1>
        <div className="tab-group">
          <button className={`tab-btn ${tab === "online" ? "active" : ""}`} onClick={() => setTab("online")}>
            <i className="ti ti-users" /> 접속 중 <span className="tab-count">{players.length}</span>
          </button>
          <button className={`tab-btn ${tab === "history" ? "active" : ""}`} onClick={() => setTab("history")}>
            <i className="ti ti-history" /> 접속 기록 <span className="tab-count">{history.length}</span>
          </button>
          <button className={`tab-btn ${tab === "op" ? "active" : ""}`} onClick={() => setTab("op")}>
            <i className="ti ti-crown" /> OP <span className="tab-count">{opList.length}</span>
          </button>
          <button className={`tab-btn ${tab === "ban" ? "active" : ""}`} onClick={() => setTab("ban")}>
            <i className="ti ti-ban" /> 밴 <span className="tab-count">{banList.length}</span>
          </button>
        </div>
      </div>

      <div className="players-content">

        {/* 접속 중 탭 */}
        {tab === "online" && (
          players.length === 0 ? (
            <div className="empty-box"><p>현재 접속 중인 플레이어가 없어요</p></div>
          ) : (
            <div className="player-list">
              {players.map((p) => (
                <div key={p.name} className="player-row">
                  <SkinAvatar name={p.name} size={40} />
                  <div className="player-info">
                    <div className="player-name">{p.name}</div>
                    <div className="player-meta">접속한 지 {elapsed(p.joinedAt)}</div>
                  </div>
                  <span className={`ping-badge ${pingColor(p.ping)}`}>
                    {p.ping > 0 ? `${p.ping}ms` : "—"}
                  </span>
                  <div className="player-actions">
                    <button
                      className={`action-btn op-btn ${opList.includes(p.name) ? "op-on" : ""}`}
                      title={opList.includes(p.name) ? "OP 해제" : "OP 부여"}
                      onClick={() => toggleOp(p.name)}
                    >
                      <i className="ti ti-crown" />
                    </button>
                    <button className="action-btn warn" title="킥"
                      onClick={() => runCmd(`kick ${p.name}`)}>
                      <i className="ti ti-user-x" />
                    </button>
                    <button className="action-btn danger" title="밴"
                      onClick={() => {
                        if (confirm(`${p.name} 플레이어를 밴할까요?`)) {
                          runCmd(`ban ${p.name}`);
                          addBan(server.id, p.name);
                        }
                      }}>
                      <i className="ti ti-ban" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )
        )}

        {/* 접속 기록 탭 */}
        {tab === "history" && (
          <div className="manage-tab">
            <div className="add-row">
              <input
                placeholder="닉네임으로 검색..."
                value={historySearch}
                onChange={(e) => setHistorySearch(e.target.value)}
              />
              {history.length > 0 && (
                <button className="btn btn-red" onClick={() => {
                  if (confirm("접속 기록을 전부 삭제할까요?"))
                    clearJoinHistory(server.id);
                }}>
                  <i className="ti ti-trash" /> 기록 삭제
                </button>
              )}
            </div>

            {filteredHistory.length === 0 ? (
              <div className="empty-box">
                <p>{historySearch ? "검색 결과가 없어요" : "아직 접속 기록이 없어요"}</p>
              </div>
            ) : (
              <div className="history-list">
                <div className="history-header">
                  <span>플레이어</span>
                  <span>접속 시간</span>
                  <span>퇴장 시간</span>
                  <span>접속 시간</span>
                  <span>상태</span>
                </div>
                {filteredHistory.map((h, i) => (
                  <div key={i} className="history-row">
                    <div className="history-player">
                      <SkinAvatar name={h.name} size={26} />
                      <span className="player-name">{h.name}</span>
                    </div>
                    <span className="history-time">{formatDate(h.joinedAt)}</span>
                    <span className="history-time">{h.leftAt ? formatDate(h.leftAt) : "—"}</span>
                    <span className="history-duration">{formatDuration(h.joinedAt, h.leftAt)}</span>
                    <span className={`history-status ${h.leftAt ? "offline" : "online"}`}>
                      {h.leftAt ? "퇴장" : "접속 중"}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* OP 탭 */}
        {tab === "op" && (
          <div className="manage-tab">
            <div className="add-row">
              <input
                placeholder="닉네임 입력..."
                value={newOp}
                onChange={(e) => setNewOp(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAddOp()}
              />
              <button className="btn btn-primary" onClick={handleAddOp} disabled={!server || !newOp.trim()}>
                <i className="ti ti-plus" /> OP 추가
              </button>
            </div>
            {opList.length === 0 ? (
              <div className="empty-box"><p>OP 목록이 비어있어요</p></div>
            ) : (
              <div className="manage-list">
                {opList.map((name) => (
                  <div key={name} className="manage-row">
                    <SkinAvatar name={name} size={40} />
                    <span className="manage-name">{name}</span>
                    <span className="op-badge">OP</span>
                    <button className="del-btn" onClick={() => handleRemoveOp(name)}>
                      <i className="ti ti-x" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 밴 탭 */}
        {tab === "ban" && (
          <div className="manage-tab">
            <div className="add-row">
              <input
                placeholder="닉네임 입력..."
                value={newBan}
                onChange={(e) => setNewBan(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAddBan()}
              />
              <button className="btn btn-red" onClick={handleAddBan} disabled={!server || !newBan.trim()}>
                <i className="ti ti-ban" /> 밴 추가
              </button>
            </div>
            {banList.length === 0 ? (
              <div className="empty-box"><p>밴 목록이 비어있어요</p></div>
            ) : (
              <div className="manage-list">
                {banList.map((name) => (
                  <div key={name} className="manage-row">
                    <SkinAvatar name={name} size={40} />
                    <span className="manage-name">{name}</span>
                    <span className="ban-badge">밴</span>
                    <button className="del-btn" onClick={() => handleRemoveBan(name)}>
                      <i className="ti ti-x" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}
