import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useServerStore } from "../store/serverStore";
import "./Controls.css";

const commandGroups = [
  {
    group: "날씨",
    icon: "ti-cloud",
    commands: [
      { label: "날씨 맑음",   desc: "날씨를 맑음으로 설정합니다",   cmd: "weather clear" },
      { label: "날씨 비",     desc: "날씨를 비로 설정합니다",       cmd: "weather rain" },
      { label: "날씨 천둥",   desc: "날씨를 천둥으로 설정합니다",   cmd: "weather thunder" },
    ],
  },
  {
    group: "시간",
    icon: "ti-sun",
    commands: [
      { label: "시간: 아침",  desc: "시간을 아침으로 설정합니다",   cmd: "time set day" },
      { label: "시간: 낮",    desc: "시간을 낮으로 설정합니다",     cmd: "time set noon" },
      { label: "시간: 저녁",  desc: "시간을 저녁으로 설정합니다",   cmd: "time set evening" },
      { label: "시간: 밤",    desc: "시간을 밤으로 설정합니다",     cmd: "time set night" },
    ],
  },
  {
    group: "게임모드",
    icon: "ti-sword",
    commands: [
      { label: "서바이벌 (전체)",   desc: "모든 플레이어를 서바이벌로",   cmd: "gamemode survival @a" },
      { label: "크리에이티브 (전체)", desc: "모든 플레이어를 크리에이티브로", cmd: "gamemode creative @a" },
      { label: "어드벤처 (전체)",   desc: "모든 플레이어를 어드벤처로",   cmd: "gamemode adventure @a" },
      { label: "관전 (전체)",       desc: "모든 플레이어를 관전 모드로",   cmd: "gamemode spectator @a" },
    ],
  },
  {
    group: "서버 관리",
    icon: "ti-settings",
    commands: [
      { label: "전체 저장",     desc: "현재 월드를 저장합니다",           cmd: "save-all" },
      { label: "화이트리스트 ON",  desc: "화이트리스트를 활성화합니다",   cmd: "whitelist on" },
      { label: "화이트리스트 OFF", desc: "화이트리스트를 비활성화합니다", cmd: "whitelist off" },
      { label: "플레이어 목록",    desc: "접속 중인 플레이어를 확인합니다", cmd: "list" },
    ],
  },
  {
  group: "인벤토리",
  icon: "ti-backpack",
  type: "buttons",
  commands: [
    { label: "인벤토리 유지 ON",  desc: "죽어도 아이템을 잃지 않습니다",  cmd: "gamerule keepInventory true" },
    { label: "인벤토리 유지 OFF", desc: "죽으면 아이템을 잃습니다",        cmd: "gamerule keepInventory false" },
  ],
},
  {
    group: "난이도",
    icon: "ti-shield",
    commands: [
      { label: "평화로움", desc: "적대적 몹이 스폰되지 않습니다", cmd: "difficulty peaceful" },
      { label: "쉬움",     desc: "쉬운 난이도로 설정합니다",     cmd: "difficulty easy" },
      { label: "보통",     desc: "보통 난이도로 설정합니다",     cmd: "difficulty normal" },
      { label: "어려움",   desc: "어려운 난이도로 설정합니다",   cmd: "difficulty hard" },
    ],
  },
];

export default function Controls() {
  const { getActiveServer, getServerStatus } = useServerStore();
  const server = getActiveServer();
  const status = server ? getServerStatus(server.id) : "stopped";
  const [running, setRunning] = useState({});
  const [custom, setCustom] = useState("");

  async function runCmd(cmd) {
    if (!server) { alert("서버를 먼저 선택해주세요"); return; }
    if (status !== "running") { alert("서버가 실행 중이어야 해요!"); return; }
    setRunning((r) => ({ ...r, [cmd]: true }));
    try {
      await invoke("send_command", { id: server.id, command: cmd });
    } catch (e) {
      alert("명령어 실패: " + e);
    } finally {
      setTimeout(() => setRunning((r) => ({ ...r, [cmd]: false })), 1000);
    }
  }

  async function runCustom() {
    if (!custom.trim()) return;
    await runCmd(custom.trim());
    setCustom("");
  }

  return (
    <div className="page">
      <div className="topbar">
        <h1 className="page-title">서버 제어</h1>
        {!server && <span className="no-server-hint" style={{ marginLeft: 10 }}>서버를 먼저 선택해주세요</span>}
      </div>

      <div className="controls-content">

        {/* 커스텀 명령어 */}
        <div className="custom-cmd-box">
          <i className="ti ti-terminal-2" />
          <input
            className="custom-cmd-input"
            placeholder="직접 명령어 입력..."
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && runCustom()}
            disabled={!server}
          />
          <button className="btn btn-primary" onClick={runCustom} disabled={!server || !custom.trim()}>
            <i className="ti ti-send" /> 실행
          </button>
        </div>

        {commandGroups.map(({ group, icon, commands }) => (
          <div key={group} className="ctrl-section">
            <div className="ctrl-section-title">
              <i className={`ti ${icon}`} /> {group}
            </div>
            <div className="ctrl-grid">
              {commands.map((c) => (
                <div key={c.cmd} className="ctrl-card">
                  <div className="ctrl-card-info">
                    <div className="ctrl-label">{c.label}</div>
                    <div className="ctrl-desc">{c.desc}</div>
                  </div>
                  <button
                    className={`btn ${running[c.cmd] ? "btn-saved" : "btn-primary"}`}
                    onClick={() => runCmd(c.cmd)}
                    disabled={!server}
                  >
                    <i className={`ti ${running[c.cmd] ? "ti-check" : "ti-player-play"}`} />
                    {running[c.cmd] ? "완료" : "실행"}
                  </button>
                </div>
              ))}
            </div>
          </div>
        ))}

      </div>
    </div>
  );
}