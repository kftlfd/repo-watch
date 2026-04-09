export function sleep(timeMs: number) {
  return new Promise<void>((res) => setTimeout(res, timeMs));
}
