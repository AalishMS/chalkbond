// The Export dialog (SPEC-clipboard-export.md "Export dialog"; mock-ups A08a PNG, A08b SVG, A08c
// PDF) on app-shell's dialog shell and primitives (V3). Stateless: the choices and the drawing's
// size come from `model/export-flow.ts`; every change goes back through `onChoose`.
import { Button, Checkbox, Dialog, RadioGroup, Segmented } from '../app/ui/primitives';
import {
  PNG_SIZES,
  reopenLine,
  sizeLine,
  type ExportChoices,
  type ExportDialogState,
  type ExportFormat,
  type PdfOutcome,
} from './model/export-flow';
import './clipboard-export.css';

const FORMATS = [
  {
    value: 'png',
    title: 'PNG picture',
    description: 'For WhatsApp, websites and printing.',
    testId: 'export-format-png',
  },
  {
    value: 'svg',
    title: 'SVG drawing',
    description: 'Stays sharp at any size in PowerPoint and Word.',
    testId: 'export-format-svg',
  },
  {
    value: 'pdf',
    title: 'PDF document',
    description: 'For printing or sending as a document.',
    testId: 'export-format-pdf',
  },
] as const;

const SIZES = PNG_SIZES.map((s) => ({
  value: String(s.dpi),
  title: s.title,
  testId: `export-size-${s.id}`,
}));

export function ExportDialog({
  state,
  pdfOutcome,
  onChoose,
  onCancel,
  onSave,
}: {
  state: ExportDialogState;
  pdfOutcome: PdfOutcome;
  onChoose(change: Partial<ExportChoices>): void;
  onCancel(): void;
  onSave(): void;
}): React.JSX.Element {
  const { choices, size } = state;
  const png = choices.format === 'png';
  const reopen = reopenLine(choices.format, pdfOutcome);
  return (
    <Dialog
      title="Export drawing"
      testId="export-dialog"
      width={400}
      className="export-dialog"
      onCancel={onCancel}
      onEnter={onSave}
      footer={
        <>
          <Button variant="secondary" data-testid="export-cancel" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="primary" data-testid="export-save" onClick={onSave}>
            Save…
          </Button>
        </>
      }
    >
      <p className="field-label">Format</p>
      <RadioGroup
        label="Format"
        value={choices.format}
        options={FORMATS}
        onChange={(value) => onChoose({ format: value as ExportFormat })}
      />
      {png && (
        <div className="export-size">
          <p className="field-label">Size</p>
          <Segmented
            label="Picture size"
            value={String(choices.pngDpi)}
            options={SIZES}
            onChange={(value) => onChoose({ pngDpi: Number(value) as ExportChoices['pngDpi'] })}
          />
          <p className="size-note" data-testid="export-size-line">
            {sizeLine(size, choices.pngDpi)}
          </p>
        </div>
      )}
      {png && (
        <div className="export-white">
          <Checkbox
            label="White background"
            help="Leave this off for slides with a coloured background."
            checked={choices.pngWhite}
            testId="export-white"
            onChange={(pngWhite) => onChoose({ pngWhite })}
          />
        </div>
      )}
      <p className={reopen.caution ? 'reopen is-warning' : 'reopen'} data-testid="export-reopen">
        <svg className="icon icon-16" aria-hidden="true">
          <use href="#info" />
        </svg>
        <span>{reopen.text}</span>
      </p>
    </Dialog>
  );
}
