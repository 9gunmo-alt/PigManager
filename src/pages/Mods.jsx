import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { useServerStore } from "../store/serverStore";
import "./Mods.css";

const LOADERS = ["fabric", "forge", "neoforge", "quilt"];
const MC_VERSIONS = ["26.1.2","26.1.1","26.1","1.21.4","1.21.3","1.21.1","1.21","1.20.6","1.20.4","1.20.2","1.20.1","1.19.4","1.19.2","1.18.2","1.17.1","1.16.5"];

export default function Mods() {
  const { getActiveServer } = useServerStore();
  const server = getActiveServer();
  const [tab, setTab] = useState("installed");
  const [mods, setMods] = useState([]);
  const [loading, setLoading] = useState(false);
  const [dragging, setDragging] = useState(false);

  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);

  const [versionModal, setVersionModal] = useState(null);
  const [versions, setVersions] = useState([]);
  const [loadingVersions, setLoadingVersions] = useState(false);
  const [versionLoader, setVersionLoader] = useState("");
  const [versionMc, setVersionMc] = useState("");
  const [downloading, setDownloading] = useState({});

  // GitHub 동기화
  const [ghRepoUrl, setGhRepoUrl]     = useState(() => localStorage.getItem("gh_repo_url") || "");
  const [ghToken, setGhToken]         = useState(() => localStorage.getItem("gh_token") || "");
  const [ghRawUrl, setGhRawUrl]       = useState(() => localStorage.getItem("gh_raw_url") || "");
  const [ghServerAddr, setGhServerAddr] = useState(() => localStorage.getItem("gh_server_addr") || "");
  const [syncing, setSyncing]         = useState(false);
  const [syncLog, setSyncLog]         = useState([]);

  useEffect(() => {
    if (!server?.serverDir) return;
    loadMods();
  }, [server?.serverDir]);

  async function loadMods() {
    setLoading(true);
    try {
      const path = server.serverDir + "\\mods";
      const files = await invoke("list_dir", { path });
      setMods(files.filter((f) => !f.is_dir && f.name.endsWith(".jar")).map((f) => ({
        name: f.name.replace(".jar", ""), fileName: f.name, path: f.path,
        size: (f.size / 1024).toFixed(1) + " KB", enabled: !f.name.startsWith("~"),
      })));
    } catch { setMods([]); } finally { setLoading(false); }
  }

  async function addMod() {
    const files = await open({ multiple: true, filters: [{ name: "Mod JAR", extensions: ["jar"] }] });
    if (!files) return;
    const list = Array.isArray(files) ? files : [files];
    for (const src of list) {
      const fileName = src.split("\\").pop().split("/").pop();
      const dest = server.serverDir + "\\mods\\" + fileName;
      try {
        const content = await invoke("read_file_base64", { path: src });
        await invoke("write_file_base64", { path: dest, data: content });
      } catch (e) { alert("복사 실패: " + e); }
    }
    await loadMods();
  }

  async function deleteMod(mod) {
    if (!confirm(`"${mod.name}" 모드를 삭제할까요?`)) return;
    try { await invoke("delete_file", { path: mod.path }); await loadMods(); }
    catch (e) { alert("삭제 실패: " + e); }
  }

  async function handleDrop(e) {
    e.preventDefault(); setDragging(false);
    const files = Array.from(e.dataTransfer.files).filter(f => f.name.endsWith(".jar"));
    if (!files.length) return;
    for (const file of files) {
      const dest = server.serverDir + "\\mods\\" + file.name;
      try {
        const content = await invoke("read_file_base64", { path: file.path });
        await invoke("write_file_base64", { path: dest, data: content });
      } catch (e) { alert("복사 실패: " + e); }
    }
    await loadMods();
  }

  async function syncToGitHub() {
    if (!server?.serverDir) { alert("서버를 먼저 선택해주세요!"); return; }
    if (!ghRepoUrl.trim())  { alert("GitHub 레포 URL을 입력해주세요!"); return; }
    if (!ghToken.trim())    { alert("GitHub 토큰을 입력해주세요!"); return; }
    if (!ghServerAddr.trim()) { alert("서버 주소를 입력해주세요! (예: 123.45.67.89:25565)"); return; }

    localStorage.setItem("gh_repo_url", ghRepoUrl);
    localStorage.setItem("gh_token", ghToken);
    localStorage.setItem("gh_raw_url", ghRawUrl);
    localStorage.setItem("gh_server_addr", ghServerAddr);

    // raw URL 자동 생성 (비어있으면)
    let rawUrl = ghRawUrl.trim();
    if (!rawUrl && ghRepoUrl.trim()) {
      // https://github.com/user/repo → https://raw.githubusercontent.com/user/repo/main
      rawUrl = ghRepoUrl.trim()
        .replace("github.com", "raw.githubusercontent.com")
        .replace(/\.git$/, "") + "/main";
    }

    setSyncing(true);
    setSyncLog([]);

    const now = new Date();
    const dateStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-${String(now.getDate()).padStart(2,"0")} ${String(now.getHours()).padStart(2,"0")}:${String(now.getMinutes()).padStart(2,"0")}`;
    const commitMsg = `Update mods - ${dateStr}`;

    const log = (msg, type = "info") => setSyncLog(prev => [...prev, { msg, type, time: new Date().toLocaleTimeString("ko-KR") }]);

    try {
      log("mods 폴더 스캔 중...");
      log(`커밋 메시지: ${commitMsg}`);

      const result = await invoke("git_sync_mods", {
        repoDir: server.serverDir,
        modsPath: "mods",
        token: ghToken.trim(),
        remoteUrl: ghRepoUrl.trim(),
        commitMsg,
        serverAddress: ghServerAddr.trim(),
        githubRepoRaw: rawUrl,
      });

      log(result, "success");
    } catch (e) {
      log("오류: " + e, "error");
    } finally {
      setSyncing(false);
    }
  }

  async function searchMods() {
    if (!query.trim()) return;
    setSearching(true); setResults([]);
    try {
      const res = await fetch(
        "https://api.modrinth.com/v2/search?query=" + encodeURIComponent(query) +
        "&facets=[[\"project_type:mod\"]]&limit=20"
      );
      const data = await res.json();
      setResults(data.hits ?? []);
    } catch (e) { alert("검색 실패: " + e); } finally { setSearching(false); }
  }

  async function openVersionModal(project) {
    if (!server?.serverDir) { alert("서버를 먼저 선택해주세요!"); return; }
    setVersionModal(project); setVersions([]); setVersionLoader(""); setVersionMc("");
    setLoadingVersions(true);
    try {
      const res = await fetch("https://api.modrinth.com/v2/project/" + project.project_id + "/version");
      const data = await res.json();
      setVersions(data);
    } catch (e) { alert("버전 목록 로드 실패: " + e); } finally { setLoadingVersions(false); }
  }

  async function downloadVersion(version) {
    const file = version.files.find(f => f.primary) || version.files[0];
    if (!file) { alert("파일을 찾을 수 없어요!"); return; }
    setDownloading((d) => ({ ...d, [version.id]: true }));
    try {
      const dest = server.serverDir + "\\mods\\" + file.filename;
      await invoke("download_file", { url: file.url, destPath: dest });
      await loadMods(); setVersionModal(null);
      alert(versionModal.title + " " + version.version_number + " 설치 완료!");
    } catch (e) { alert("다운로드 실패: " + e); }
    finally { setDownloading((d) => ({ ...d, [version.id]: false })); }
  }

  const filteredVersions = versions.filter((v) => {
    if (versionLoader && !v.loaders?.includes(versionLoader)) return false;
    if (versionMc && !v.game_versions?.includes(versionMc)) return false;
    return true;
  });

  const availableLoaders = [...new Set(versions.flatMap(v => v.loaders ?? []))];
  const availableMcVersions = [...new Set(versions.flatMap(v => v.game_versions ?? []))].slice(0, 30);

  return (
    <div className="page">
      <div className="topbar">
        <h1 className="page-title">모드</h1>
        <div className="tab-group">
          <button className={"tab-btn" + (tab === "installed" ? " active" : "")} onClick={() => setTab("installed")}>
            <i className="ti ti-puzzle" /> 설치됨 <span className="tab-count">{mods.length}</span>
          </button>
          <button className={"tab-btn" + (tab === "search" ? " active" : "")} onClick={() => setTab("search")}>
            <i className="ti ti-search" /> 검색
          </button>
          <button className={"tab-btn" + (tab === "github" ? " active" : "")} onClick={() => setTab("github")}>
            <i className="ti ti-brand-github" /> GitHub 동기화
          </button>
        </div>
        <div className="topbar-right">
          <button className="btn" onClick={loadMods}><i className="ti ti-refresh" /> 새로고침</button>
          <button className="btn btn-primary" onClick={addMod} disabled={!server || tab === "search"}>
            <i className="ti ti-plus" /> 추가
          </button>
        </div>
      </div>

      <div className="mods-content">
        {tab === "installed" && (
          <>
            <div className={"drop-zone" + (dragging ? " dragging" : "")}
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)} onDrop={handleDrop}>
              <i className="ti ti-puzzle" />
              <span>모드 JAR 파일을 여기에 드래그하거나 위 추가 버튼을 눌러주세요</span>
            </div>
            {!server ? <div className="empty-state"><i className="ti ti-puzzle-off" /><p>설정에서 서버를 먼저 추가해주세요</p></div>
            : loading ? <div className="empty-state"><i className="ti ti-loader" /><p>불러오는 중...</p></div>
            : mods.length === 0 ? <div className="empty-state"><i className="ti ti-puzzle-off" /><p>mods 폴더에 JAR 파일이 없어요</p></div>
            : (
              <div className="mod-list">
                {mods.map((m) => (
                  <div key={m.path} className="mod-row">
                    <div className="mod-info">
                      <div className="mod-name">{m.name}</div>
                      <div className="mod-size">{m.size}</div>
                    </div>
                    <span className={"mod-badge " + (m.enabled ? "enabled" : "disabled")}>{m.enabled ? "활성" : "비활성"}</span>
                    <button className="del-btn" onClick={() => deleteMod(m)}><i className="ti ti-x" /></button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {tab === "search" && (
          <div className="search-tab">
            <div className="search-bar">
              <i className="ti ti-search" />
              <input placeholder="모드 검색... (Modrinth)" value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && searchMods()} />
              <button className="btn btn-primary" onClick={searchMods} disabled={searching}>
                {searching ? <i className="ti ti-loader" /> : "검색"}
              </button>
            </div>
            {results.length === 0 && !searching ? (
              <div className="empty-state"><i className="ti ti-search" /><p>모드 이름을 검색해주세요</p></div>
            ) : (
              <div className="search-results">
                {results.map((r) => (
                  <div key={r.project_id} className="search-row">
                    {r.icon_url ? <img src={r.icon_url} className="search-icon" alt="" />
                      : <div className="search-icon-placeholder"><i className="ti ti-puzzle" /></div>}
                    <div className="search-info">
                      <div className="search-name">{r.title}</div>
                      <div className="search-desc">{r.description}</div>
                      <div className="search-meta">
                        <span><i className="ti ti-download" /> {r.downloads?.toLocaleString()}</span>
                        <span><i className="ti ti-tag" /> {r.latest_version}</span>
                      </div>
                    </div>
                    <button className="btn btn-primary" onClick={() => openVersionModal(r)}>
                      <i className="ti ti-download" /> 설치
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

        {tab === "github" && (
          <div className="github-tab">
            <div className="github-form">
              <div className="form-group">
                <label><i className="ti ti-brand-github" /> GitHub 레포 URL</label>
                <input
                  placeholder="https://github.com/유저명/레포이름"
                  value={ghRepoUrl}
                  onChange={(e) => setGhRepoUrl(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label><i className="ti ti-key" /> Personal Access Token</label>
                <input
                  type="password"
                  placeholder="ghp_xxxxxxxxxx"
                  value={ghToken}
                  onChange={(e) => setGhToken(e.target.value)}
                />
                <div className="scan-hint">
                  github.com → Settings → Developer settings → Personal access tokens → repo 권한 필요
                </div>
              </div>

              <div className="form-group">
                <label><i className="ti ti-server" /> 서버 주소</label>
                <input
                  placeholder="예: 123.45.67.89:25565"
                  value={ghServerAddr}
                  onChange={(e) => setGhServerAddr(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label><i className="ti ti-link" /> Raw URL (비워두면 자동 생성)</label>
                <input
                  placeholder="https://raw.githubusercontent.com/유저명/레포/main"
                  value={ghRawUrl}
                  onChange={(e) => setGhRawUrl(e.target.value)}
                />
                <div className="scan-hint">비워두면 레포 URL에서 자동으로 생성해요</div>
              </div>
              <button
                className="btn btn-primary sync-btn"
                onClick={syncToGitHub}
                disabled={syncing || !server}
              >
                {syncing
                  ? <><i className="ti ti-loader" /> 동기화 중...</>
                  : <><i className="ti ti-brand-github" /> GitHub에 동기화</>
                }
              </button>
            </div>

            {syncLog.length > 0 && (
              <div className="sync-log">
                <div className="sync-log-title">동기화 로그</div>
                {syncLog.map((l, i) => (
                  <div key={i} className={`sync-log-row ${l.type}`}>
                    <span className="sync-log-time">{l.time}</span>
                    <span className="sync-log-msg">{l.msg}</span>
                  </div>
                ))}
              </div>
            )}

            <div className="github-info">
              <i className="ti ti-info-circle" />
              <div>
                <div>버튼을 누르면 <strong>mods 폴더</strong>를 지정한 GitHub 레포에 자동으로 push해요.</div>
                <div>변경된 파일이 없으면 커밋하지 않아요.</div>
              </div>
            </div>
          </div>
        )}

      {versionModal && (
        <div className="modal-overlay" onClick={() => setVersionModal(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title-row">
                {versionModal.icon_url && <img src={versionModal.icon_url} className="modal-icon" alt="" />}
                <h2>{versionModal.title} 버전 선택</h2>
              </div>
              <button className="icon-btn" onClick={() => setVersionModal(null)}><i className="ti ti-x" /></button>
            </div>
            <div className="modal-filters">
              <select className="filter-select" value={versionLoader} onChange={(e) => setVersionLoader(e.target.value)}>
                <option value="">모든 로더</option>
                {availableLoaders.map(l => <option key={l} value={l}>{l}</option>)}
              </select>
              <select className="filter-select" value={versionMc} onChange={(e) => setVersionMc(e.target.value)}>
                <option value="">모든 MC 버전</option>
                {availableMcVersions.map(v => <option key={v} value={v}>{v}</option>)}
              </select>
              <span className="filter-count">{filteredVersions.length}개</span>
            </div>
            <div className="modal-body">
              {loadingVersions ? (
                <div className="empty-state"><i className="ti ti-loader" /><p>버전 목록 불러오는 중...</p></div>
              ) : filteredVersions.length === 0 ? (
                <div className="empty-state"><i className="ti ti-puzzle-off" /><p>조건에 맞는 버전이 없어요</p></div>
              ) : (
                <div className="version-list">
                  {filteredVersions.map((v) => (
                    <div key={v.id} className="version-row">
                      <div className="version-info">
                        <div className="version-number">{v.version_number}</div>
                        <div className="version-meta">
                          {v.game_versions?.slice(0, 3).join(", ")}
                          {v.loaders && <span> · {v.loaders.join(", ")}</span>}
                        </div>
                      </div>
                      <span className={"version-type " + v.version_type}>
                        {v.version_type === "release" ? "정식" : v.version_type === "beta" ? "베타" : "알파"}
                      </span>
                      <button className="btn btn-primary" onClick={() => downloadVersion(v)} disabled={downloading[v.id]}>
                        {downloading[v.id] ? <i className="ti ti-loader" /> : <><i className="ti ti-download" /> 설치</>}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
