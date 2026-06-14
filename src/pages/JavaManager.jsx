import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import "./JavaManager.css";

const ADOPTIUM_VERSIONS = [21, 17, 11, 8];

export default function JavaManager() {
  const [javaList, setJavaList] = useState([]);
  const [scanning, setScanning] = useState(false);
  const [downloads, setDownloads] = useState({});

  async function scan() {
    setScanning(true);
    try {
      const list = await invoke("detect_java");
      setJavaList(list);
    } catch (e) {
      alert("Java 감지 실패: " + e);
    } finally {
      setScanning(false);
    }
  }

  useEffect(() => { scan(); }, []);

  async function installJava(version) {
    const key = String(version);
    setDownloads((d) => ({ ...d, [key]: { status: "fetching", progress: "" } }));
    try {
      // Adoptium API로 최신 LTS 다운로드 URL 가져오기
      const apiUrl = `https://api.adoptium.net/v3/assets/latest/${version}/hotspot?architecture=x64&image_type=jre&os=windows&vendor=eclipse`;
      const res = await fetch(apiUrl);
      if (!res.ok) throw new Error("Adoptium API 오류");
      const data = await res.json();
      const binary = data[0]?.binary;
      if (!binary) throw new Error("다운로드 정보를 찾을 수 없어요");

      const downloadUrl = binary.package.link;
      const fileName = binary.package.name;
      const destPath = `C:\\Program Files\\Eclipse Adoptium\\${fileName}`;

      setDownloads((d) => ({ ...d, [key]: { status: "downloading", progress: fileName } }));

      await invoke("download_file", { url: downloadUrl, destPath });

      setDownloads((d) => ({ ...d, [key]: { status: "done", progress: "설치 파일이 저장됐어요. 직접 실행해서 설치해주세요!" } }));

      // 설치 후 재스캔
      await scan();
    } catch (e) {
      setDownloads((d) => ({ ...d, [key]: { status: "error", progress: String(e) } }));
    }
  }

  function versionColor(version) {
    const n = parseInt(version.replace("Java ", ""));
    if (n >= 21) return "green";
    if (n >= 17) return "blue";
    if (n >= 11) return "amber";
    return "gray";
  }

  return (
    <div className="page">
      <div className="topbar">
        <h1 className="page-title">Java 관리</h1>
        <button className="btn btn-primary" onClick={scan} disabled={scanning}>
          <i className={`ti ${scanning ? "ti-loader-2" : "ti-refresh"}`} />
          {scanning ? "감지 중..." : "다시 감지"}
        </button>
      </div>

      <div className="java-content">

        {/* 설치된 Java 목록 */}
        <section className="java-section">
          <div className="section-title-row">
            <div className="section-title">설치된 Java</div>
            <div className="section-desc">시스템에서 감지된 Java 목록이에요</div>
          </div>

          {javaList.length === 0 ? (
            <div className="empty-box">
              <i className="ti ti-brand-java" />
              <p>{scanning ? "감지 중..." : "설치된 Java를 찾을 수 없어요"}</p>
            </div>
          ) : (
            <div className="java-list">
              {javaList.map((j, i) => (
                <div key={i} className="java-card">
                  <div className={`java-version-badge ${versionColor(j.version)}`}>
                    {j.version}
                  </div>
                  <div className="java-info">
                    <div className="java-vendor">{j.vendor}</div>
                    <div className="java-path">{j.path}</div>
                    <div className="java-raw">{j.raw}</div>
                  </div>
                  <div className="java-status">
                    <i className="ti ti-check" /> 사용 가능
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Java 설치 */}
        <section className="java-section">
          <div className="section-title-row">
            <div className="section-title">Java 설치</div>
            <div className="section-desc">Eclipse Temurin (Adoptium) LTS 버전을 다운로드해요</div>
          </div>

          <div className="install-grid">
            {ADOPTIUM_VERSIONS.map((ver) => {
              const dl = downloads[String(ver)];
              const installed = javaList.some(j => j.version === `Java ${ver}`);
              return (
                <div key={ver} className={`install-card ${installed ? "installed" : ""}`}>
                  <div className="install-ver">Java {ver}</div>
                  <div className="install-label">
                    {ver === 21 && "최신 LTS"}
                    {ver === 17 && "LTS"}
                    {ver === 11 && "LTS"}
                    {ver === 8  && "구버전 LTS"}
                  </div>
                  {installed ? (
                    <div className="install-done"><i className="ti ti-check" /> 설치됨</div>
                  ) : (
                    <button
                      className="btn btn-primary install-btn"
                      onClick={() => installJava(ver)}
                      disabled={dl?.status === "downloading" || dl?.status === "fetching"}
                    >
                      {dl?.status === "fetching" && <><i className="ti ti-loader-2" /> 정보 가져오는 중</>}
                      {dl?.status === "downloading" && <><i className="ti ti-loader-2" /> 다운로드 중</>}
                      {(!dl || dl.status === "error") && <><i className="ti ti-download" /> 다운로드</>}
                      {dl?.status === "done" && <><i className="ti ti-check" /> 완료</>}
                    </button>
                  )}
                  {dl?.progress && (
                    <div className={`install-msg ${dl.status === "error" ? "error" : ""}`}>
                      {dl.progress}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="install-notice">
            <i className="ti ti-info-circle" />
            다운로드 후 설치 파일(.msi)을 직접 실행해서 설치해주세요. 설치 완료 후 <strong>다시 감지</strong> 버튼을 눌러요.
          </div>
        </section>

      </div>
    </div>
  );
}
