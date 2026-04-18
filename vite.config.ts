import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [sveltekit()],
	server: { port: 8473, strictPort: true },
	preview: { port: 8473, strictPort: true }
});
