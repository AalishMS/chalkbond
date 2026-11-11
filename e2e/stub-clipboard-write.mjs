// UI-success checks and shots only (e2e/clipboard-ui.spec.ts, e2e/shots/C8.shot.ts), never Windows
// clipboard verification: the flow and rasteriser stay real, only the transport write is a no-op.
// Production never loads this; launch.ts preloads it for `clipboardWriteSuccess`.
import { clipboard } from 'electron';
clipboard.write = async () => {};
