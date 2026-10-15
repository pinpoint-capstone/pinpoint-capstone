/**
 * Formats a duration in seconds into mm:ss format.
 * E.g., 203.4 -> "03:23"
 */
export function formatTime(seconds: number): string {
  if (isNaN(seconds) || seconds < 0) return '00:00';
  const totalSeconds = Math.floor(seconds);
  const minutes = Math.floor(totalSeconds / 60);
  const remainingSec = totalSeconds % 60;

  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const remainingMin = minutes % 60;
    return `${hours}:${remainingMin.toString().padStart(2, '0')}:${remainingSec.toString().padStart(2, '0')}`;
  }

  return `${minutes.toString().padStart(2, '0')}:${remainingSec.toString().padStart(2, '0')}`;
}

/**
 * Formats score into percentage string.
 * E.g., 0.96 -> "96% 일치"
 */
export function formatScore(score: number): string {
  const percentage = Math.round(score * 100);
  return `${percentage}% 일치`;
}
