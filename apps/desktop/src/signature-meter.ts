/** The logo's 4:2 stripe rhythm. The terminal active stripe is fully white. */
export function signatureMeter(percentage: number | null, width: number) {
  const value =
    percentage !== null && Number.isFinite(percentage)
      ? Math.min(100, Math.max(0, percentage))
      : 0;
  const trackWidth = Number.isFinite(width) ? Math.max(0, width) : 0;
  const activeWidth = (trackWidth * value) / 100;
  const tipLeft =
    activeWidth > 0 ? Math.max(0, Math.ceil(activeWidth / 6) - 1) * 6 : 0;
  return {
    value,
    tipLeft,
    tipWidth: activeWidth > 0 ? Math.min(4, trackWidth - tipLeft) : 0,
  };
}
