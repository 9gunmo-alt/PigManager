import { useState } from "react";
import { useThemeStore, themes } from "../store/themeStore";
import "./PanelOpts.css";

export default function PanelOpts() {
  const { theme, setTheme, fontSize, setFontSize } = useThemeStore();

  return (
    <div className="page">
      <div className="topbar">
        <h1 className="page-title">패널 설정</h1>
      </div>

      <div className="panelopts-content">

        <section className="settings-section">
          <div className="section-header">
            <div>
              <div className="section-title">테마</div>
              <div className="section-desc">패널 색상 테마를 선택해요</div>
            </div>
          </div>
          <div className="theme-cards">
            {Object.values(themes).map((t) => (
              <div key={t.id}
                className={`theme-card ${theme === t.id ? "active" : ""}`}
                onClick={() => setTheme(t.id)}>
                <div className="theme-preview">
                  <div className="tp-sidebar" style={{ background: t.preview.sidebar }} />
                  <div className="tp-main" style={{ background: t.preview.main }}>
                    <div className="tp-bar" style={{ background: t.preview.bar }} />
                    <div className="tp-bar short" style={{ background: t.preview.accent, opacity: 0.8 }} />
                  </div>
                </div>
                {theme === t.id && <i className="ti ti-check theme-check" />}
                <div className="theme-name">{t.name}</div>
                <div className="theme-desc">{t.desc}</div>
              </div>
            ))}
          </div>
        </section>

        <section className="settings-section">
          <div className="section-header">
            <div><div className="section-title">일반</div></div>
          </div>
          <div className="setting-rows">
            <div className="setting-row">
              <div>
                <div className="setting-label">트레이 최소화</div>
                <div className="setting-desc">창을 닫아도 백그라운드에서 서버가 유지돼요</div>
              </div>
              <Toggle defaultOn />
            </div>
            <div className="setting-row">
              <div>
                <div className="setting-label">플레이어 접속 알림</div>
                <div className="setting-desc">플레이어가 접속하면 시스템 알림을 보여줘요</div>
              </div>
              <Toggle defaultOn />
            </div>
            <div className="setting-row">
              <div>
                <div className="setting-label">서버 오류 알림</div>
                <div className="setting-desc">ERROR 로그 발생 시 알림을 보여줘요</div>
              </div>
              <Toggle defaultOn />
            </div>
          </div>
        </section>

      </div>
    </div>
  );
}

function Toggle({ defaultOn = false }) {
  const [on, setOn] = useState(defaultOn);
  return <div className={`toggle ${on ? "on" : ""}`} onClick={() => setOn(!on)} />;
}