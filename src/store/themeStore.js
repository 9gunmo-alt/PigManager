import { create } from "zustand";
import { persist } from "zustand/middleware";

export const themes = {
  dark: {
    id: "dark",
    name: "다크",
    desc: "GitHub 스타일",
    preview: { sidebar: "#161b22", main: "#0d1117", bar: "#30363d", accent: "#39d353" },
  },
  light: {
    id: "light",
    name: "라이트",
    desc: "깔끔한 화이트",
    preview: { sidebar: "#ffffff", main: "#f8f9fa", bar: "#dee2e6", accent: "#2f9e44" },
  },
  midnight: {
    id: "midnight",
    name: "미드나이트",
    desc: "퍼플 다크",
    preview: { sidebar: "#111118", main: "#0a0a0f", bar: "#242430", accent: "#a78bfa" },
  },
};

export const useThemeStore = create(
  persist(
    (set) => ({
      theme: "dark",
      fontSize: 15,
      setTheme: (theme) => {
        set({ theme });
        document.documentElement.setAttribute("data-theme", theme);
      },
      setFontSize: (size) => {
        set({ fontSize: size });
      },
    }),
    {
      name: "mc-panel-theme",
      onRehydrateStorage: () => (state) => {
        if (state) {
          document.documentElement.setAttribute("data-theme", state.theme ?? "dark");
        }
      },
    }
  )
);