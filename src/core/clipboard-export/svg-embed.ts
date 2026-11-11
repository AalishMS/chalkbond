export function readSvgDrawing(svgText: string): string | null {
  const tags = svgText.matchAll(
    /<metadata\b((?:[^<>"']|"[^"]*"|'[^']*')*)>([^<]*)<\/metadata\s*>/g,
  );
  for (const tag of tags) {
    const attrs = tag[1] ?? '';
    const attributes = [...attrs.matchAll(/([^\s=]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)];
    const id = attributes.some((a) => a[1] === 'id' && (a[2] ?? a[3]) === 'chalkbond');
    if (!id) continue;
    let valid = true;
    const text = (tag[2] ?? '').replace(/&([^;]*);/g, (_, entity: string) => {
      const named: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
      if (named[entity] !== undefined) return named[entity];
      const n = /^#\d+$/.test(entity)
        ? Number(entity.slice(1))
        : /^#x[\da-f]+$/i.test(entity)
          ? parseInt(entity.slice(2), 16)
          : -1;
      if (n <= 0 || n > 0x10ffff || (n >= 0xd800 && n <= 0xdfff)) {
        valid = false;
        return '';
      }
      return String.fromCodePoint(n);
    });
    return valid && !/&(?!(?:[^;]*;))/.test(tag[2] ?? '') ? text : null;
  }
  return null;
}
