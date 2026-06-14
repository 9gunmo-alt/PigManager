import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useServerStore } from "../store/serverStore";
import "./Properties.css";

const PROP_META = {
  "server-port":               { label: "서버 포트",           desc: "서버 접속 포트 번호",               type: "text" },
  "max-players":               { label: "최대 플레이어 수",     desc: "동시 접속 가능한 최대 인원",         type: "text" },
  "motd":                      { label: "서버 설명 (MOTD)",     desc: "서버 목록에 표시되는 설명",           type: "text" },
  "difficulty":                { label: "난이도",               desc: "서버 난이도 설정",                   type: "select", options: ["peaceful","easy","normal","hard"] },
  "gamemode":                  { label: "기본 게임모드",         desc: "신규 플레이어 기본 게임모드",         type: "select", options: ["survival","creative","adventure","spectator"] },
  "level-name":                { label: "월드 이름",             desc: "월드 폴더 이름",                     type: "text" },
  "level-seed":                { label: "월드 시드",             desc: "월드 생성 시드값 (비어있으면 랜덤)", type: "text" },
  "server-ip":                 { label: "서버 IP",               desc: "바인딩할 IP (비어있으면 전체)",     type: "text" },
  "spawn-protection":          { label: "스폰 보호 반경",        desc: "스폰 주변 보호 구역 크기 (블록)",   type: "text" },
  "view-distance":             { label: "시야 거리",             desc: "청크 렌더링 거리",                   type: "text" },
  "simulation-distance":       { label: "시뮬레이션 거리",       desc: "엔티티 처리 거리",                   type: "text" },
  "max-world-size":            { label: "최대 월드 크기",        desc: "월드 최대 반경 (블록)",             type: "text" },
  "resource-pack":             { label: "리소스팩 URL",          desc: "리소스팩 다운로드 주소",             type: "text" },
  "pvp":                       { label: "PVP 허용",              desc: "플레이어 간 전투 허용 여부",         type: "bool" },
  "online-mode":               { label: "정품 인증",             desc: "Mojang 정품 계정만 접속 허용",       type: "bool" },
  "white-list":                { label: "화이트리스트",           desc: "목록에 있는 플레이어만 접속 허용",   type: "bool" },
  "allow-nether":              { label: "네더 허용",             desc: "네더 차원 접근 허용",               type: "bool" },
  "allow-flight":              { label: "비행 허용",             desc: "서바이벌 모드에서 비행 허용",       type: "bool" },
  "enable-command-block":      { label: "커맨드 블록",           desc: "커맨드 블록 사용 허용",             type: "bool" },
  "spawn-monsters":            { label: "몬스터 스폰",           desc: "적대적 몹 생성 여부",               type: "bool" },
  "spawn-animals":             { label: "동물 스폰",             desc: "동물 생성 여부",                     type: "bool" },
  "spawn-npcs":                { label: "NPC 스폰",              desc: "주민 등 NPC 생성 여부",             type: "bool" },
  "hardcore":                  { label: "하드코어 모드",         desc: "죽으면 밴되는 하드코어 모드",       type: "bool" },
  "force-gamemode":            { label: "게임모드 강제",         desc: "접속 시 기본 게임모드로 강제 변경", type: "bool" },
  "generate-structures":       { label: "구조물 생성",           desc: "마을, 던전 등 구조물 생성 여부",   type: "bool" },
  "enable-rcon":               { label: "RCON 활성화",           desc: "원격 콘솔 연결 허용",               type: "bool" },
  "enable-query":              { label: "쿼리 허용",             desc: "서버 쿼리 프로토콜 허용",           type: "bool" },
  "enable-status":             { label: "서버 상태 표시",        desc: "서버 목록에 상태 표시 여부",         type: "bool" },
  "broadcast-console-to-ops":  { label: "콘솔 로그 OP 전달",     desc: "콘솔 명령어 로그를 OP에게 전달",   type: "bool" },
  "broadcast-rcon-to-ops":     { label: "RCON 로그 OP 전달",     desc: "RCON 명령어 로그를 OP에게 전달",   type: "bool" },
  "accepts-transfers":         { label: "서버 이동 허용",        desc: "/transfer 명령어로 서버 이동 허용", type: "bool" },
  "enforce-secure-profile":    { label: "보안 프로필 강제",      desc: "Mojang 보안 프로필 강제 적용",     type: "bool" },
  "enforce-whitelist":         { label: "화이트리스트 강제",     desc: "비목록 플레이어 즉시 킥",           type: "bool" },
  "prevent-proxy-connections": { label: "프록시 차단",           desc: "프록시/VPN 연결 차단",             type: "bool" },
  "require-resource-pack":     { label: "리소스팩 강제",         desc: "리소스팩 수락 강제",               type: "bool" },
  "sync-chunk-writes":         { label: "청크 동기 쓰기",        desc: "청크 데이터 동기 방식으로 저장",   type: "bool" },
};

export default function Properties() {
  const { getActiveServer } = useServerStore();
  const server = getActiveServer();
  const [props, setProps] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!server?.serverDir) return;
    loadProps();
  }, [server?.serverDir]);

  async function loadProps() {
    setLoading(true);
    try {
      const path = server.serverDir + "\\server.properties";
      const content = await invoke("read_file", { path });
      const parsed = content
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l && !l.startsWith("#"))
        .map((l) => {
          const idx = l.indexOf("=");
          return { key: l.slice(0, idx), value: l.slice(idx + 1) };
        });
      setProps(parsed);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }

  async function saveProps() {
    try {
      const path = server.serverDir + "\\server.properties";
      const original = await invoke("read_file", { path });
      let content = original;
      for (const p of props) {
        const escaped = p.key.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&");
        content = content.replace(new RegExp(`^${escaped}=.*`, "m"), `${p.key}=${p.value}`);
      }
      await invoke("write_file", { path, content });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) { alert("저장 실패: " + e); }
  }

  function updateProp(key, value) {
    setProps((prev) => prev.map((p) => p.key === key ? { ...p, value } : p));
  }

  // 한글 메타 있는 것만 표시
  const known = props.filter((p) => PROP_META[p.key]);

  return (
    <div className="page">
      <div className="topbar">
        <h1 className="page-title">프로퍼티</h1>
        <div className="topbar-right">
          <button className="btn" onClick={loadProps}><i className="ti ti-refresh" /> 새로고침</button>
          <button className={`btn ${saved ? "btn-saved" : "btn-primary"}`} onClick={saveProps} disabled={!server}>
            <i className={`ti ${saved ? "ti-check" : "ti-device-floppy"}`} />
            {saved ? "저장됨" : "저장"}
          </button>
        </div>
      </div>

      <div className="props-content">
        {!server ? (
          <div className="empty-state"><i className="ti ti-file-off" /><p>설정에서 서버를 먼저 추가해주세요</p></div>
        ) : loading ? (
          <div className="empty-state"><i className="ti ti-loader" /><p>불러오는 중...</p></div>
        ) : props.length === 0 ? (
          <div className="empty-state">
            <i className="ti ti-file-off" />
            <p>server.properties 파일을 찾을 수 없어요</p>
            <span className="empty-hint">서버를 한 번 실행하면 자동으로 생성돼요</span>
          </div>
        ) : (
          <div className="prop-list">
            {known.map((p) => {
              const meta = PROP_META[p.key];
              return (
                <div key={p.key} className="prop-row">
                  <div className="prop-info">
                    <div className="prop-label">{meta.label}</div>
                    <div className="prop-desc">{meta.desc}</div>
                  </div>
                  <div className="prop-control">
                    {meta.type === "bool" ? (
                      <div
                        className={`toggle ${p.value.trim() === "true" ? "on" : ""}`}
                        onClick={() => updateProp(p.key, p.value.trim() === "true" ? "false" : "true")}
                      />
                    ) : meta.type === "select" ? (
                      <select
                        className="prop-select"
                        value={p.value.trim()}
                        onChange={(e) => updateProp(p.key, e.target.value)}
                      >
                        {meta.options.map((o) => (
                          <option key={o} value={o}>{o}</option>
                        ))}
                      </select>
                    ) : (
                      <input
                        className="prop-input"
                        value={p.value}
                        onChange={(e) => updateProp(p.key, e.target.value)}
                      />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}