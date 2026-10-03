/** Scene lighting follows the current airport clock, never data health or the device timezone. */
export function airportScene(at: number): 'day' | 'night' {
  const hour = new Date(at + 9 * 3_600_000).getUTCHours();
  return hour >= 6 && hour < 18 ? 'day' : 'night';
}
