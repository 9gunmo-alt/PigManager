import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import "./Downloader.css";

const SERVER_TYPES = {
  paper: {
    name: "Paper",
    desc: "가장 인기있는 Bukkit 기반 서버. 플러그인 지원",
    icon: "ti-file-text",
    color: "blue",
  },
  fabric: {
    name: "Fabric",
    desc: "모드 지원에 최적화된 경량 서버",
    icon: "ti-puzzle",
    color: "amber",
  },
  purpur: {
    name: "Purpur",
    desc: "Paper 기반 고성능 서버. 추가 기능 다수",
    icon: "ti-star",
    color: "purple",
  },
  vanilla: {
    name: "Vanilla",
    desc: "순정 마인크래프트 서버",
    icon: "ti-cube",
    color: "green",
  },
};

async function fetchVersions(type) {
  try {
    if (type === "paper") {
      const res = await fetch("https://api.papermc.io/v2/projects/paper");
      const data = await res.json();
      return [...data.versions].reverse().slice(0, 20);
    }
    if (type === "fabric") {
      const res = await fetch("https://meta.fabricmc.net/v2/versions/game");
      const data = await res.json();
      return data.filter((v) => v.stable).map((v) => v.version).slice(0, 15);
    }
    if (type === "purpur") {
      const res = await fetch("https://api.purpurmc.org/v2/purpur");
      const data = await res.json();
      return [...data.versions].reverse().slice(0, 15);
    }
    if (type === "vanilla") {
      const res = await fetch("https://launchermeta.mojang.com/mc/game/version_manifest.json");
      const data = await res.json();
      return data.versions.filter((v) => v.type === "release").map((v) => v.id).slice(0, 15);
    }
  } catch {
    return [];
  }
  return [];
}

function getDownloadUrl(type, version) {
  if (type === "paper") return "https://api.papermc.io/v2/projects/paper/versions/" + version + "/builds/latest/downloads/paper-" + version + "-latest.jar";
  if (type === "fabric") return "https://meta.fabricmc.net/v2/versions/loader/" + version + "/0.16.5/1.0.1/server/jar";
  if (type === "purpur") return "https://api.purpurmc.org/v2/purpur/" + version + "/latest/download";
  return "";
}

export default function Downloader() {
  const [selected, setSelected] = useState("paper");
  const [versions, setVersions] = useState([]);
  const [version, setVersion] = useState("");
  const [savePath, setSavePath] = useState("");
  const [downloading, setDownloading] = useState(false);
  const [done, setDone] = useState(false);
  const [loadingVersions, setLoadingVersions] = useState(false);

  useEffect(() => {
    loadVersions(selected);
  }, [selected]);

  async function loadVersions(type) {
    setLoadingVersions(true);
    setVersions([]);
    setVersion("");
    setDone(false);
    const list = await fetchVersions(type);
    setVersions(list);
    if (list.length > 0) setVersion(list[0]);
    setLoadingVersions(false);
  }

  async function pickFolder() {
    const result = await open({ directory: true, title: "저장할 폴더 선택" });
    if (result) setSavePath(result);
  }

  async function download() {
    if (!savePath) { alert("저장할 폴더를 선택해주세요!"); return; }
    if (selected === "vanilla") { alert("Vanilla 서버는 Mojang 공식 사이트에서 직접 다운로드해주세요.\nhttps://www.minecraft.net/ko-kr/download/server"); return; }
    setDownloading(true);
    setDone(false);
    try {
      const fileName = selected + "-" + version + ".jar";
      const destPath = savePath + "\\" + fileName;
      await invoke("download_file", { url: getDownloadUrl(selected, version), destPath });
      setDone(true);
    } catch (e) {
      alert("다운로드 실패: " + e);
    } finally {
      setDownloading(false);
    }
  }

  const type = SERVER_TYPES[selected];

  return (
    <div className="page">
      <div className="topbar">
        <h1 className="page-title">서버 다운로드</h1>
      </div>
      <div className="downloader-content">
        <div className="dl-section">
          <div className="dl-section-title">서버 종류 선택</div>
          <div className="server-type-grid">
            {Object.entries(SERVER_TYPES).map(([key, t]) => (
              <div
                key={key}
                className={"server-type-card " + t.color + (selected === key ? " active" : "")}
                onClick={() => setSelected(key)}
              >
                <i className={"ti " + t.icon} />
                <div className="type-name">{t.name}</div>
                <div className="type-desc">{t.desc}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="dl-section">
          <div className="dl-section-title">버전 및 저장 위치</div>
          <div className="dl-form">
            <div className="dl-form-row">
              <label>버전</label>
              {loadingVersions ? (
                <span className="loading-hint"><i className="ti ti-loader" /> 버전 목록 불러오는 중...</span>
              ) : (
                <select value={version} onChange={(e) => { setVersion(e.target.value); setDone(false); }}>
                  {versions.map((v) => (
                    <option key={v} value={v}>{v}</option>
                  ))}
                </select>
              )}
            </div>
            <div className="dl-form-row">
              <label>저장 폴더</label>
              <div className="input-row">
                <input placeholder="폴더를 선택해주세요" value={savePath} readOnly />
                <button className="btn" onClick={pickFolder}>
                  <i className="ti ti-folder" /> 선택
                </button>
              </div>
            </div>
          </div>
        </div>
        <div className="dl-section">
          <div className="dl-preview">
            <div className="dl-preview-info">
              <i className={"ti " + type.icon} />
              <div>
                <div className="dl-preview-name">{type.name} {version}</div>
                <div className="dl-preview-file">{selected}-{version}.jar</div>
              </div>
            </div>
            <button
              className={"btn " + (done ? "btn-saved" : "btn-primary")}
              onClick={download}
              disabled={downloading || !savePath || !version || loadingVersions}
            >
              {downloading ? (
                <span><i className="ti ti-loader" /> 다운로드 중...</span>
              ) : done ? (
                <span><i className="ti ti-check" /> 완료!</span>
              ) : (
                <span><i className="ti ti-download" /> 다운로드</span>
              )}
            </button>
          </div>
          {done && (
            <div className="dl-done">
              <i className="ti ti-check" />
              <span>{savePath}\{selected}-{version}.jar 에 저장됐어요!</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
