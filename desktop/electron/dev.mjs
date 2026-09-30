import { createServer } from 'vite';
import { spawn } from 'node:child_process';
import electron from 'electron';
const server = await createServer();
await server.listen();
const child = spawn(electron, ['.'], { stdio: 'inherit', env: { ...process.env, DESKTOP_DEV: '1' } });
child.on('exit', async code => { await server.close(); process.exit(code ?? 0); });
process.on('SIGINT', () => child.kill());
