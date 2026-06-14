import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { useServerStore } from "../store/serverStore";
import "./Settings.css";

export default function Settings() {
  const { servers, addServer, updateServer, removeServer, activeServerId, setActiveServer } = useServerStore();
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({
    name: "", serverDir: "", jarPath: "", version: "",
    ramMb: 2048, ramMin: 1024, port: "25565", image: "", javaPath: "",
  });
  const [scanning, setScanning] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [javaList, setJavaList] = useState([]);

  useEffect(() => {
    invoke("detect_java").then(setJavaList).catch(() => {});
  }, []);

  function openAdd() {
    setForm({ name: "", serverDir: "", jarPath: "", version: "", ramMb: 2048, ramMin: 1024, port: "25565", image: "", javaPath: "" });
    setEditingId(null);
    setShowAddModal(true);
  }

  function openEdit(sv) {
    setForm({ ramMin: 1024, ...sv, _iconSrcPath: "" });
    setEditingId(sv.id);
    setShowAddModal(true);
  }

  async function pickFolder() {
    const selected = await open({ directory: true, multiple: false, title: "서버 폴더 선택" });
    if (!selected) return;
    setScanning(true);
    try {
      const files = await invoke("list_dir", { path: selected });
      const jars = files.filter((f) => !f.is_dir && f.name.endsWith(".jar"));
      const priority = ["paper", "purpur", "spigot", "craftbukkit", "forge", "fabric", "server"];
      let detected = null;
      for (const kw of priority) {
        detected = jars.find((j) => j.name.toLowerCase().includes(kw));
        if (detected) break;
      }
      if (!detected && jars.length > 0) detected = jars[0];
      let version = "";
      const folderName = selected.split("\\").pop() || selected.split("/").pop() || "내 서버";
      if (detected) {
        const match = detected.name.match(/(\d+\.\d+[\.\d]*)/);
        const ver = match?.[1] ?? "";
        const n = detected.name.toLowerCase();
        if (n.includes("paper"))       version = `Paper ${ver}`;
        else if (n.includes("purpur")) version = `Purpur ${ver}`;
        else if (n.includes("spigot")) version = `Spigot ${ver}`;
        else if (n.includes("forge"))  version = `Forge ${ver}`;
        else if (n.includes("fabric")) version = `Fabric ${ver}`;
        else version = ver ? `Vanilla ${ver}` : "";
      }
      setForm((f) => ({
        ...f, serverDir: selected,
        jarPath: detected?.path ?? "",
        version, name: f.name || folderName,
      }));
    } catch (e) { console.error(e); }
    finally { setScanning(false); }
  }

  async function pickJar() {
    const selected = await open({ filters: [{ name: "JAR", extensions: ["jar"] }] });
    if (selected) setForm((f) => ({ ...f, jarPath: selected }));
  }

  async function pickImage() {
    const selected = await open({
      filters: [{ name: "이미지", extensions: ["png", "jpg", "jpeg", "webp"] }],
    });
    if (selected) {
      // 패널 썸네일용 base64 저장
      const content = await invoke("read_file_base64", { path: selected }).catch(() => null);
      if (content) setForm((f) => ({ ...f, image: `data:image/png;base64,${content}`, _iconSrcPath: selected }));
    }
  }

  async function saveServer() {
    if (!form.name || !form.serverDir || !form.jarPath) {
      alert("이름, 서버 폴더, JAR 파일은 필수예요!"); return;
    }

    // 이미지 선택됐으면 서버 폴더에 server-icon.png로 복사
    if (form._iconSrcPath && form.serverDir) {
      try {
        await invoke("copy_server_icon", {
          srcPath: form._iconSrcPath,
          serverDir: form.serverDir,
        });
      } catch (e) {
        console.warn("server-icon.png 복사 실패:", e);
      }
    }

    const { _iconSrcPath, ...saveForm } = form;
    if (editingId) { updateServer(editingId, saveForm); }
    else { const id = addServer(saveForm); setActiveServer(id); }
    setShowAddModal(false);
  }

  async function handleDrop(e) {
    e.preventDefault();
    setDragging(false);
    const items = Array.from(e.dataTransfer.files);
    if (!items.length) return;
    const path = items[0].path;
    if (!path) return;
    setForm({ name: "", serverDir: path, jarPath: "", version: "", ramMb: 2048, ramMin: 1024, port: "25565", image: "", javaPath: "" });
    setEditingId(null);
    setShowAddModal(true);
    setScanning(true);
    try {
      const files = await invoke("list_dir", { path });
      const jars = files.filter((f) => !f.is_dir && f.name.endsWith(".jar"));
      const priority = ["paper", "purpur", "spigot", "craftbukkit", "forge", "fabric", "server"];
      let detected = null;
      for (const kw of priority) {
        detected = jars.find((j) => j.name.toLowerCase().includes(kw));
        if (detected) break;
      }
      if (!detected && jars.length > 0) detected = jars[0];
      let version = "";
      const folderName = path.split("\\").pop() || "내 서버";
      if (detected) {
        const match = detected.name.match(/(\d+\.\d+[\.\d]*)/);
        const ver = match?.[1] ?? "";
        const n = detected.name.toLowerCase();
        if (n.includes("paper"))       version = `Paper ${ver}`;
        else if (n.includes("purpur")) version = `Purpur ${ver}`;
        else if (n.includes("spigot")) version = `Spigot ${ver}`;
        else if (n.includes("forge"))  version = `Forge ${ver}`;
        else if (n.includes("fabric")) version = `Fabric ${ver}`;
        else version = ver ? `Vanilla ${ver}` : "";
      }
      setForm((f) => ({ ...f, jarPath: detected?.path ?? "", version, name: folderName }));
    } catch (e) { console.error(e); }
    finally { setScanning(false); }
  }

  return (
    <div className="page">
      <div className="topbar">
        <h1 className="page-title">서버관리</h1>
        <button className="btn btn-primary" onClick={openAdd}>
          <i className="ti ti-plus" /> 서버 추가
        </button>
      </div>

      <div className="settings-content">
        <section className="settings-section">
          <div
            className={`drop-zone ${dragging ? "dragging" : ""}`}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
          >
            <i className="ti ti-folder-open" />
            <span>서버 폴더를 여기에 드래그하거나 <button className="drop-zone-btn" onClick={openAdd}>직접 추가</button></span>
          </div>

          {servers.length === 0 ? (
            <div className="empty-state">
              <i className="ti ti-server-off" />
              <p>아직 추가된 서버가 없어요</p>
            </div>
          ) : (
            <div className="server-cards">
              {servers.map((sv) => (
                <div key={sv.id}
                  className={`server-card ${activeServerId === sv.id ? "active" : ""}`}
                  onClick={() => setActiveServer(sv.id)}>
                  <div className="server-card-left">
                    {sv.image
                      ? <img src={sv.image} className="server-card-img" alt="" />
                      : <div className="server-card-icon"><i className="ti ti-server" /></div>
                    }
                    <div>
                      <div className="server-card-name">{sv.name}</div>
                      <div className="server-card-path">{sv.serverDir}</div>
                    </div>
                  </div>
                  <div className="server-card-right">
                    {sv.version && <span className="ver-badge">{sv.version}</span>}
                    <span className="ram-badge">{sv.ramMb ?? 2048}MB</span>
                    <button className="icon-btn" onClick={(e) => { e.stopPropagation(); openEdit(sv); }}>
                      <i className="ti ti-edit" />
                    </button>
                    <button className="icon-btn danger" onClick={(e) => {
                      e.stopPropagation();
                      if (confirm(`"${sv.name}" 서버를 삭제할까요?`)) removeServer(sv.id);
                    }}>
                      <i className="ti ti-trash" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {showAddModal && (
        <div className="modal-overlay" onClick={() => setShowAddModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{editingId ? "서버 편집" : "서버 추가"}</h2>
              <button className="icon-btn" onClick={() => setShowAddModal(false)}>
                <i className="ti ti-x" />
              </button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>서버 폴더 *</label>
                <div className="input-row">
                  <input placeholder="폴더를 선택하면 자동으로 인식해요" value={form.serverDir} readOnly />
                  <button className="btn btn-primary" onClick={pickFolder} disabled={scanning}>
                    <i className={`ti ${scanning ? "ti-loader" : "ti-folder"}`} />
                    {scanning ? "인식 중..." : "폴더 선택"}
                  </button>
                </div>
                {scanning && <div className="scan-hint">서버 파일을 자동으로 인식하고 있어요...</div>}
              </div>

              <div className="form-row">
                <div className="form-group" style={{ flex: 1 }}>
                  <label>서버 이름 *</label>
                  <input placeholder="내 서버" value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label>서버 이미지</label>
                  <div className="image-pick-row">
                    {form.image
                      ? <img src={form.image} className="image-preview" alt="" />
                      : <div className="image-preview-empty"><i className="ti ti-photo" /></div>
                    }
                    <button className="btn" onClick={pickImage}>
                      <i className="ti ti-upload" /> 선택
                    </button>
                  </div>
                </div>
              </div>

              <div className="form-group">
                <label>서버 JAR 파일 *
                  {form.jarPath
                    ? <span className="auto-badge">자동 인식됨</span>
                    : <span className="auto-badge warn">직접 선택 필요</span>
                  }
                </label>
                <div className="input-row">
                  <input placeholder="server.jar" value={form.jarPath} readOnly />
                  <button className="btn" onClick={pickJar}>
                    <i className="ti ti-file" /> 직접 선택
                  </button>
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>버전 {form.version && <span className="auto-badge">자동 인식됨</span>}</label>
                  <input placeholder="Paper 1.21.1" value={form.version}
                    onChange={(e) => setForm((f) => ({ ...f, version: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label>포트</label>
                  <input placeholder="25565" value={form.port}
                    onChange={(e) => setForm((f) => ({ ...f, port: e.target.value }))} />
                </div>
              </div>

              <div className="form-group">
                <label>RAM 할당</label>
                <div className="ram-range-wrap">
                  <div className="ram-range-labels">
                    <span>최소: <strong>{(form.ramMin ?? 1024) >= 1024 ? ((form.ramMin ?? 1024) / 1024).toFixed(1) + " GB" : (form.ramMin ?? 1024) + " MB"}</strong></span>
                    <span>최대: <strong>{form.ramMb >= 1024 ? (form.ramMb / 1024).toFixed(1) + " GB" : form.ramMb + " MB"}</strong></span>
                  </div>
                  <div className="ram-slider-row">
                    <span className="ram-slider-label">최소</span>
                    <input type="range" min={512} max={16384} step={512}
                      value={form.ramMin ?? 1024}
                      onChange={(e) => setForm((f) => ({ ...f, ramMin: Number(e.target.value) }))} />
                  </div>
                  <div className="ram-slider-row">
                    <span className="ram-slider-label">최대</span>
                    <input type="range" min={512} max={16384} step={512}
                      value={form.ramMb}
                      onChange={(e) => setForm((f) => ({ ...f, ramMb: Number(e.target.value) }))} />
                  </div>
                </div>
              </div>

              <div className="form-group">
                <label>Java 경로
                  {form.javaPath && <span className="auto-badge">선택됨</span>}
                </label>
                <select
                  value={form.javaPath}
                  onChange={(e) => setForm((f) => ({ ...f, javaPath: e.target.value }))}
                  className="java-select"
                >
                  <option value="">시스템 기본 Java 사용</option>
                  {javaList.map((j) => (
                    <option key={j.path} value={j.path}>
                      {j.version} — {j.vendor}
                    </option>
                  ))}
                </select>
                {javaList.length === 0 && (
                  <div className="scan-hint">Java를 감지하지 못했어요. Java 관리 페이지에서 설치해주세요.</div>
                )}
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn" onClick={() => setShowAddModal(false)}>취소</button>
              <button className="btn btn-primary" onClick={saveServer}>
                {editingId ? "저장" : "추가"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}