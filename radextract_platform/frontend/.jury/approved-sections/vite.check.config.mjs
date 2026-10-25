import {defineConfig} from 'vite';
import {fileURLToPath} from 'node:url';
export default defineConfig({build:{outDir:'.jury/approved-sections/build',emptyOutDir:true,rollupOptions:{input:fileURLToPath(new URL('./landing-check.html',import.meta.url))}}});
