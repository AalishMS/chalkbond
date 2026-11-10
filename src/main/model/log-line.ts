export const LOG_MAX_BYTES = 1024 * 1024;

export function logLine(time: string, source: string, message: string): string {
  return `${time} ${source.replace(/[\r\n]/g, ' ')} ${message.replace(/[\r\n]/g, ' ')}\n`;
}
export function shouldRotate(bytes: number): boolean {
  return bytes >= LOG_MAX_BYTES;
}
