/** W3: only the drawing extension is hidden; pictures retain theirs. */
export function windowTitle(name: string, dirty: boolean): string {
  return `${dirty ? '*' : ''}${name.replace(/\.chalk$/i, '')} - Chalkbond`;
}
