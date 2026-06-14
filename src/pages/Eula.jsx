import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useServerStore } from "../store/serverStore";
import "./Eula.css";

export default function Eula() {
  const { getActiveServer } = useServerStore();
  const server = getActiveServer();
  const [eulaContent, setEulaContent] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!server?.serverDir) return;
    loadEula();
  }, [server?.serverDir]);

  async function loadEula() {
    try {
      const path = server.serverDir + "\\eula.txt";
      const content = await invoke("read_file", { path });
      setEulaContent(content);
      setAgreed(content.includes("eula=true"));
    } catch {
      setEulaContent("");
      setAgreed(false);
    }
  }

  async function saveEula(value) {
    try {
      const path = server.serverDir + "\\eula.txt";
      const newContent = "#EULA\neula=" + (value ? "true" : "false") + "\n";
      await invoke("write_file", { path, content: newContent });
      setAgreed(value);
      setEulaContent(newContent);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      alert("저장 실패: " + e);
    }
  }

  if (!server) {
    return (
      <div className="page">
        <div className="topbar">
          <h1 className="page-title">EULA</h1>
        </div>
        <div className="eula-content">
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
        <h1 className="page-title">EULA</h1>
        <div className="topbar-right">
          <button className="btn" onClick={loadEula}>
            <i className="ti ti-refresh" /> 새로고침
          </button>
          {saved && (
            <span className="saved-hint">
              <i className="ti ti-check" /> 저장됨
            </span>
          )}
        </div>
      </div>
      <div className="eula-content">
        <div className={`eula-status ${agreed ? "agreed" : "disagreed"}`}>
          <i className={`ti ${agreed ? "ti-check" : "ti-x"}`} />
          <span>현재: <strong>{agreed ? "동의 (서버 실행 가능)" : "동의하지 않음 (서버 실행 불가)"}</strong></span>
        </div>
        <div className="eula-section">
          <div className="eula-section-title">동의 여부 변경</div>
          <p className="eula-desc">아래 버튼을 클릭하는 것은 하단의 필독사항을 모두 숙지하였다는 것을 의미합니다.</p>
          <div className="eula-choices">
            <div className={"eula-choice agree" + (agreed ? " active" : "")} onClick={() => saveEula(true)}>
              <div className="choice-header">
                <i className="ti ti-check" />
                <span>동의</span>
              </div>
              <div className="choice-desc">
                <p>EULA의 내용에 모두 동의합니다.</p>
                <p>서버의 파일에 해당 내용을 기록하는 것에 동의합니다.</p>
              </div>
            </div>
            <div className={"eula-choice disagree" + (!agreed ? " active" : "")} onClick={() => saveEula(false)}>
              <div className="choice-header">
                <i className="ti ti-x" />
                <span>동의하지 않음</span>
              </div>
              <div className="choice-desc">
                <p>EULA의 내용에 동의하지 않습니다.</p>
                <p>서버의 파일에 해당 내용을 기록하는 것에 동의합니다.</p>
              </div>
            </div>
          </div>
        </div>
        {eulaContent !== "" && (
          <div className="eula-section">
            <div className="eula-section-title">EULA 파일 전문</div>
            <pre className="eula-file-content">{eulaContent}</pre>
          </div>
        )}
        <div className="eula-section">
          <div className="eula-notice">
            <p>EULA는 최종 사용자가 서버를 이용하기 위해 동의하여야만 하는 사항입니다.</p>
            <p>동의하지 않을 경우 서버를 이용할 수 없습니다. (본 프로그램과 무관)</p>
            <p>아래의 웹 페이지의 자세한 내용을 숙지한 뒤 동의 여부를 결정하여 주세요.</p>
            <a href="https://aka.ms/MinecraftEULA" target="_blank" rel="noreferrer" className="eula-link">
              <i className="ti ti-external-link" /> https://aka.ms/MinecraftEULA
            </a>
          </div>
          <div className="eula-notice" style={{ marginTop: 12 }}>
            <p>서버는 폴더 내의 eula.txt 파일에 기록된 사용자의 응답에 따라 서버를 실행합니다.</p>
            <p>이 화면에서 동의 여부를 변경할 경우 본 프로그램이 해당 파일에 동의 여부를 기록합니다.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
