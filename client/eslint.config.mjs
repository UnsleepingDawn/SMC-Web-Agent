import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
    baseDirectory: __dirname,
});

const eslintConfig = [
    {
        ignores: [".next/**", "node_modules/**", "out/**", "next-env.d.ts", "public/pdf.worker.mjs"],
    },
    ...compat.extends("next/core-web-vitals", "next/typescript"),
    {
        rules: {
            "react-hooks/exhaustive-deps": "off"
        }
    }
];

export default eslintConfig;
