import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const PORT = process.env.PORT || 4567;
export const PROJECTS_ROOT = path.resolve(__dirname, '../../projects');
export const DATA_ROOT = path.resolve(__dirname, '../../data');
