export function exportFileName(baseName: string | null, format: 'png' | 'svg' | 'pdf'): string {
  const stem = (baseName ?? '')
    .replace(/\.(chalk|png|svg|pdf)$/i, '')
    .replace(/[<>:"/\\|?*]/g, '-')
    .split('')
    .map((c) => (c.charCodeAt(0) < 32 ? '-' : c))
    .join('')
    .replace(/^[. ]+|[. ]+$/g, '')
    .slice(0, 120)
    .replace(/[. ]+$/g, '');
  return (stem || 'Untitled') + '.' + format;
}
