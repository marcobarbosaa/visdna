/** Aggregates secondary failures without retaining URLs, query strings or arbitrary errors. */
export class ResourceWarnings {
  private readonly counts = new Map<string, number>();
  add(status?: number) {
    const key =
      status === undefined ? 'network, TLS, policy or resource-limit failure' : `HTTP ${status}`;
    this.counts.set(key, (this.counts.get(key) || 0) + 1);
  }
  messages() {
    return [...this.counts]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(
        ([reason, count]) =>
          `SECONDARY RESOURCE WARNING: ${count} secondary resource(s): ${reason}. Main document analysis completed successfully.`,
      );
  }
}
export function mainDocumentError(status: number) {
  return `MAIN DOCUMENT ERROR: Página inacessível (HTTP ${status}).`;
}
export function isMainDocument(navigation: boolean, mainFrame: boolean) {
  return navigation && mainFrame;
}
