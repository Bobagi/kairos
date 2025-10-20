import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import fs from 'fs';
import path from 'path';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
	const env = loadEnv(mode, process.cwd(), '');

	console.log('Loaded VITE_API_BASE_URL:', env.VITE_API_BASE_URL);

	return {
		plugins: [tailwindcss(), sveltekit()],
		server: {
			host: '0.0.0.0',
			port: 3055,
			https: {
				key: fs.readFileSync(path.resolve(__dirname, 'certs/localhost-key.pem')),
				cert: fs.readFileSync(path.resolve(__dirname, 'certs/localhost.pem'))
			},
			proxy: {
                                '/game': {
                                        target: env.VITE_API_BASE_URL || 'https://chronos.bobagi.space',
                                        changeOrigin: true,
                                        secure: true
                                },
                                '/auth': {
                                        target: env.VITE_API_BASE_URL || 'https://chronos.bobagi.space',
                                        changeOrigin: true,
                                        secure: true
                                },
                                '/friends': {
                                        target: env.VITE_API_BASE_URL || 'https://chronos.bobagi.space',
                                        changeOrigin: true,
                                        secure: true
                                }
			}
		},
		test: {
			projects: [
				{
					extends: './vite.config.ts',
					test: {
						name: 'client',
						environment: 'browser',
						browser: {
							enabled: true,
							provider: 'playwright',
							instances: [{ browser: 'chromium' }]
						},
						include: ['src/**/*.svelte.{test,spec}.{js,ts}'],
						exclude: ['src/lib/server/**'],
						setupFiles: ['./vitest-setup-client.ts']
					}
				},
				{
					extends: './vite.config.ts',
					test: {
						name: 'server',
						environment: 'node',
						include: ['src/**/*.{test,spec}.{js,ts}'],
						exclude: ['src/**/*.svelte.{test,spec}.{js,ts}']
					}
				}
			]
		}
	};
});
