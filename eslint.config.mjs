// eslint-config-next ships native flat config from v16, so the shareable
// configs are spread directly. The FlatCompat bridge this used to need broke
// on the upgrade: compat re-parses a flat config as eslintrc and chokes on the
// circular plugin references it contains.
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypeScript from "eslint-config-next/typescript";

const eslintConfig = [
  ...nextCoreWebVitals,
  ...nextTypeScript,
  {
    ignores: ["node_modules/**", ".next/**", "out/**", "build/**", "next-env.d.ts"],
  },
];

export default eslintConfig;
