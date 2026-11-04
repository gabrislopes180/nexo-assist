export function ticketPanelErrorMode(
  isError: boolean,
  hasData: boolean,
): "blocking" | "refresh" | "none" {
  if (!hasData) return "blocking";
  if (!isError) return "none";
  return "refresh";
}
