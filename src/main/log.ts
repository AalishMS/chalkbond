import { appendFileSync, existsSync, mkdirSync, renameSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { logLine, shouldRotate } from './model/log-line';

export function createLogger(userData: string): (source: string, message: string) => void {
  const folder = join(userData, 'logs');
  const path = join(folder, 'main.log');
  return (source, message) => {
    try {
      mkdirSync(folder, { recursive: true });
      if (existsSync(path) && shouldRotate(statSync(path).size)) {
        renameSync(path, join(folder, 'main.old.log'));
      }
      appendFileSync(path, logLine(new Date().toISOString(), source, message), 'utf8');
    } catch (error) {
      console.error('Unable to write main log', error);
    }
  };
}
