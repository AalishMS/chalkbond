/** The sole keyboard selection rule for shell radio groups. */
export function radioIndex(index: number, count: number, key: string): number | null {
  if (count === 0) return null;
  switch (key) {
    case 'Home':
      return 0;
    case 'End':
      return count - 1;
    case 'ArrowLeft':
    case 'ArrowUp':
      return (index + count - 1) % count;
    case 'ArrowRight':
    case 'ArrowDown':
      return (index + 1) % count;
    default:
      return null;
  }
}
