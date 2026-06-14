import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { useServerStore } from "../store/serverStore";
import "./ResourcePack.css";

export default function ResourcePack() {
  const { getActiveServer } = useServerStore();
  const server = getActiveServer();
  const [packUrl, setPackUrl] = useState("");
  const [packHash, setPackHash] = useState("");
  const [required, setRequired] = useState(false);
  const [saved, setSaved] = useState(false);
  const [packs, setPacks] = useState([]);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    if (!server?.serverDir) return;
    loadProps();
    loadPacks();
  }, [server?.serverDir]);

  async function loadProps() {
    try {
      const path = server.serverDir + "\\server.properties";
      const content = await invoke("read_file", { path });
      const lines = content.split("\n");
      const getVal = (key) => {
        const line = lines.find((l) => l.startsWith(key + "="));
        return line ? line.slice(key.length + 1).trim() : "";
      };
      setPackUrl(getVal("resource-pack"));
      setPackHash(getVal("resource-pack-sha1"));
      setRequired(getVal("require-resource-pack") === "true");
    } catch (e) {
      console.error(e);
    }
  }

  async function loadPacks() {
    try {
      const path = server.serverDir + "\\resourcepacks";
      const files = await invoke("list_dir", { path });
      setPacks(files.filter((f) => !f.is_dir && (f.name.endsWith(".zip") || f.name.endsWith(".jar"))));
    } catch {
      setPacks([]);
    }
  }

  async function saveProps() {
    try {
      const path = server.serverDir + "\\server.properties";
      let content = await invoke("read_file", { path });
      const setVal = (key, val) => {
        const escaped = key.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&");
        if (content.match(new RegExp("^" + escaped + "=", "m"))) {
          content = content.replace(new RegExp("^" + escaped + "=.*", "m"), key + "=" + val);
        } else {
          content += "\n" + key + "=" + val;
        }
      };
      setVal("resource-pack", packUrl);
      setVal("resource-pack-sha1", packHash);
      setVal("require-resource-pack", required ? "true" : "false");
      await invoke("write_file", { path, content });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      alert("저장 실패: " + e);
    }
  }

  async function addPack() {
    const files = await open({ multiple: true, filters: [{ name: "리소스팩", extensions: ["zip", "jar"] }] });
    if (!files) return;
    const list = Array.isArray(files) ? files : [files];
    for (const src of list) {
      const fileName = src.split("\\").pop().split("/").pop();
      const dest = server.serverDir + "\\resourcepacks\\" + fileName;
      try {
        const content = await invoke("read_file_base64", { path: src });
        await invoke("write_file_base64", { path: dest, data: content });
      } catch (e) {
        alert("복사 실패: " + e);
      }
    }
    await loadPacks();
  }

  async function deletePack(path) {
    if (!confirm("리소스팩을 삭제할까요?")) return;
    try {
      await invoke("delete_file", { path });
      await loadPacks();
    } catch (e) {
      alert("삭제 실패: " + e);
    }
  }

  async function handleDrop(e) {
    e.preventDefault();
    setDragging(false);
    const files = Array.from(e.dataTransfer.files).filter((f) => f.name.endsWith(".zip") || f.name.endsWith(".jar"));
    if (!files.length) return;
    for (const file of files) {
      const dest = server.serverDir + "\\resourcepacks\\" + file.name;
      try {
        const content = await invoke("read_file_base64", { path: file.path });
        await invoke("write_file_base64", { path: dest, data: content });
      } catch (e) {
        alert("복사 실패: " + e);
      }
    }
    await loadPacks();
  }

  if (!server) {
    return (
      <div className="page">
        <div className="topbar">
          <h1 className="page-title">리소스팩</h1>
        </div>
        <div className="rp-content">
          <div className="empty-state">
            <i className="ti ti-file-off" />
            <p>설정에서 서버를 먼저 추가해주세요</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="topbar">
        <h1 className="page-title">리소스팩</h1>
        <div className="topbar-right">
          <button className={`btn ${saved ? "btn-saved" : "btn-primary"}`} onClick={saveProps}>
            <i className={`ti ${saved ? "ti-check" : "ti-device-floppy"}`} />
            {saved ? "저장됨" : "저장"}
          </button>
        </div>
      </div>
      <div className="rp-content">
        <div className="rp-section">
          <div className="rp-section-title">서버 리소스팩 URL 설정</div>
          <div className="rp-form">
            <div className="rp-form-row">
              <label>리소스팩 URL</label>
              <input
                placeholder="https://example.com/resourcepack.zip"
                value={packUrl}
                onChange={(e) => setPackUrl(e.target.value)}
                style={{ flex: 1 }}
              />
            </div>
            <div className="rp-form-row">
              <label>SHA-1 해시</label>
              <input
                placeholder="선택사항"
                value={packHash}
                onChange={(e) => setPackHash(e.target.value)}
                style={{ flex: 1 }}
              />
            </div>
            <div className="rp-form-row">
              <label>강제 적용</label>
              <div className={"toggle" + (required ? " on" : "")} onClick={() => setRequired(!required)} />
            </div>
          </div>
        </div>
        <div className="rp-section">
          <div className="rp-section-title">로컬 리소스팩 파일</div>
          <div
            className={"drop-zone" + (dragging ? " dragging" : "")}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
          >
            <i className="ti ti-file-zip" />
            <span>리소스팩 ZIP 파일을 드래그하거나 <button className="drop-zone-btn" onClick={addPack}>직접 추가</button></span>
          </div>
          {packs.length === 0 ? (
            <div className="empty-state">
              <i className="ti ti-file-off" />
              <p>resourcepacks 폴더에 파일이 없어요</p>
            </div>
          ) : (
            <div className="rp-list">
              {packs.map((p) => (
                <div key={p.path} className="rp-row">
                  <i className="ti ti-file-zip rp-icon" />
                  <div className="rp-info">
                    <div className="rp-name">{p.name}</div>
                    <div className="rp-size">{(p.size / 1024).toFixed(1)} KB</div>
                  </div>
                  <button className="del-btn" onClick={() => deletePack(p.path)}>
                    <i className="ti ti-x" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
