export function hasCrmWorkspaceAccess(isPlatformAdmin: boolean, accessibleWorkspaceCount: number): boolean {
  return isPlatformAdmin || accessibleWorkspaceCount > 0;
}

export function resolveWorkspaceSelection(
  isPlatformAdmin: boolean,
  requestedId: string | undefined,
  currentId: string,
  accessibleIds: string[],
): string {
  if (requestedId && accessibleIds.includes(requestedId)) return requestedId;
  if (currentId && accessibleIds.includes(currentId)) return currentId;
  return isPlatformAdmin ? "" : accessibleIds[0] ?? "";
}
