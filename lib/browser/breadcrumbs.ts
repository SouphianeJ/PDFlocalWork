export type Breadcrumb = {
  label: string;
  path: string;
};

export function buildBreadcrumbs(pathValue: string): Breadcrumb[] {
  const windowsMatch = pathValue.match(/^([a-zA-Z]:)(\\.*)?$/);
  if (windowsMatch) {
    const root = `${windowsMatch[1]}\\`;
    const trailing = pathValue.slice(root.length);
    const parts = trailing.split("\\").filter(Boolean);
    const breadcrumbs = [{ label: windowsMatch[1], path: root }];
    let current = root.replace(/\\$/, "");

    for (const part of parts) {
      current = `${current}\\${part}`;
      breadcrumbs.push({ label: part, path: current });
    }

    return breadcrumbs;
  }

  const normalized = pathValue.replace(/\/+/g, "/");
  const parts = normalized.split("/").filter(Boolean);

  if (normalized.startsWith("/")) {
    const breadcrumbs = [{ label: "/", path: "/" }];
    let current = "";
    for (const part of parts) {
      current = `${current}/${part}` || "/";
      breadcrumbs.push({ label: part, path: current });
    }
    return breadcrumbs;
  }

  if (parts.length === 0) {
    return [];
  }

  const breadcrumbs = [{ label: parts[0], path: parts[0] }];
  let current = parts[0];
  for (const part of parts.slice(1)) {
    current = `${current}/${part}`;
    breadcrumbs.push({ label: part, path: current });
  }

  return breadcrumbs;
}
