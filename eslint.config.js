// 只启用 react-hooks 规则集：rules-of-hooks 抓"闸门后声明 hook"这类
// 运行时才爆的 Rules of Hooks 违规（本项目已三次踩坑）。
// 解析器用 eslint-parser-oxc（原生 TS/TSX、兼容 eslint 10；绕开 typescript-eslint 暂不支持 TS 7 的限制）。
import oxcParser from "eslint-parser-oxc";
import eslintPluginReactHooks from "eslint-plugin-react-hooks";

export default [
  {
    files: ["src/**/*.{ts,tsx}"],
    languageOptions: { parser: oxcParser },
    plugins: { "react-hooks": eslintPluginReactHooks },
    rules: {
      // 只开这一条：捕获"hook 在早退闸门/条件分支之后声明"（运行时才爆的崩溃源）
      "react-hooks/rules-of-hooks": "error",
    },
  },
];
