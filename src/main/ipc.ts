import { ipcMain, type BrowserWindow } from 'electron';
import type { ZodType } from 'zod';

type Frame = { url: string };
type Sender = { senderFrame: Frame | null };
type Logger = (message: string) => void;

export function validateRequest<T>(
  event: Sender,
  mainFrame: Frame | undefined,
  appUrl: string,
  schema: ZodType<T>,
  payload: unknown,
  log: Logger,
): T {
  try {
    if (
      !mainFrame ||
      event.senderFrame !== mainFrame ||
      event.senderFrame.url.split('?')[0] !== appUrl.split('?')[0]
    ) {
      throw new Error('Untrusted IPC sender');
    }
    return schema.parse(payload);
  } catch {
    log('Rejected IPC request');
    throw new Error('Rejected IPC request');
  }
}

export function createIpc(getWindow: () => BrowserWindow | undefined, appUrl: string, log: Logger) {
  function checked<T>(event: Sender, schema: ZodType<T>, payload: unknown): T {
    return validateRequest(event, getWindow()?.webContents.mainFrame, appUrl, schema, payload, log);
  }
  return {
    handle<T>(channel: string, schema: ZodType<T>, fn: (value: T) => unknown) {
      ipcMain.handle(channel, async (event, payload: unknown) => {
        try {
          return await fn(checked(event, schema, payload));
        } catch (error) {
          log('IPC handler failed');
          throw error;
        }
      });
    },
    on<T>(channel: string, schema: ZodType<T>, fn: (value: T) => void) {
      ipcMain.on(channel, (event, payload: unknown) => {
        try {
          fn(checked(event, schema, payload));
        } catch {
          log('IPC listener rejected');
        }
      });
    },
  };
}
