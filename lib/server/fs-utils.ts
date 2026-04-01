import path from "node:path";
import { promises as fs } from "node:fs";
import {
  type DirectoryItem,
  type DirectoryListing,
  type FileItem,
  isSupportedMergeExtension,
} from "@/lib/shared";

export async function ensureDirectoryExists(inputPath: string) {
  const resolvedPath = path.resolve(inputPath);
  const stats = await fs.stat(resolvedPath);

  if (!stats.isDirectory()) {
    throw new Error("The provided path is not a directory.");
  }

  return resolvedPath;
}

export async function getDirectoryListing(inputPath: string): Promise<DirectoryListing> {
  const resolvedPath = await ensureDirectoryExists(inputPath);
  const dirEntries = await fs.readdir(resolvedPath, { withFileTypes: true });

  const directories: DirectoryItem[] = [];
  const files: FileItem[] = [];

  for (const entry of dirEntries) {
    const fullPath = path.join(resolvedPath, entry.name);

    if (entry.isDirectory()) {
      directories.push({ name: entry.name, path: fullPath });
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    const extension = path.extname(entry.name).toLowerCase();
    if (!isSupportedMergeExtension(extension)) {
      continue;
    }

    const stats = await fs.stat(fullPath);
    files.push({
      name: entry.name,
      path: fullPath,
      extension,
      size: stats.size,
      modifiedAt: stats.mtime.toISOString(),
    });
  }

  directories.sort((left, right) => left.name.localeCompare(right.name, undefined, { sensitivity: "base" }));
  files.sort((left, right) => left.name.localeCompare(right.name, undefined, { sensitivity: "base" }));

  return {
    name: path.basename(resolvedPath) || resolvedPath,
    path: resolvedPath,
    parentPath: path.dirname(resolvedPath) === resolvedPath ? null : path.dirname(resolvedPath),
    directories,
    files,
  };
}

export async function getDirectorySuggestions(inputPath: string, limit = 5) {
  const trimmedPath = inputPath.trim();
  if (!trimmedPath) {
    return [];
  }

  const normalizedInput = path.normalize(trimmedPath);
  const hasTrailingSeparator = /[\\/]$/.test(trimmedPath);
  const parentPath = hasTrailingSeparator ? normalizedInput : path.dirname(normalizedInput);
  const rawPrefix = hasTrailingSeparator ? "" : path.basename(normalizedInput);

  try {
    const resolvedParentPath = await ensureDirectoryExists(parentPath);
    const dirEntries = await fs.readdir(resolvedParentPath, { withFileTypes: true });

    return dirEntries
      .filter((entry) => entry.isDirectory())
      .filter((entry) => entry.name.toLowerCase().startsWith(rawPrefix.toLowerCase()))
      .sort((left, right) => left.name.localeCompare(right.name, undefined, { sensitivity: "base" }))
      .slice(0, limit)
      .map((entry) => {
        const fullPath = path.join(resolvedParentPath, entry.name);
        return {
          name: entry.name,
          path: fullPath,
          completion: `${fullPath}${path.sep}`,
        };
      });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }

    throw error;
  }
}

export function assertSafeFileNames(fileNames: string[]) {
  for (const fileName of fileNames) {
    if (path.basename(fileName) !== fileName) {
      throw new Error("Nested paths are not allowed.");
    }
  }
}

export async function findAvailablePdfName(directoryPath: string, requestedName: string) {
  const parsed = path.parse(requestedName);
  const stem = parsed.name || "output";
  const extension = parsed.ext || ".pdf";
  let candidate = `${stem}${extension}`;
  let index = 1;

  while (true) {
    const candidatePath = path.join(directoryPath, candidate);

    try {
      await fs.access(candidatePath);
      candidate = `${stem} (${index})${extension}`;
      index += 1;
    } catch {
      return candidate;
    }
  }
}

export async function deleteFilesFromDirectory(directoryPath: string, fileNames: string[]) {
  assertSafeFileNames(fileNames);

  for (const fileName of fileNames) {
    const filePath = path.join(directoryPath, fileName);
    const stats = await fs.stat(filePath);
    if (!stats.isFile()) {
      throw new Error(`"${fileName}" is not a file.`);
    }
  }

  for (const fileName of fileNames) {
    const filePath = path.join(directoryPath, fileName);
    await fs.unlink(filePath);
  }

  return {
    deletedCount: fileNames.length,
    deletedFiles: fileNames,
  };
}

export async function renameFileInDirectory(directoryPath: string, oldName: string, newName: string) {
  assertSafeFileNames([oldName, newName]);

  const oldPath = path.join(directoryPath, oldName);
  const newPath = path.join(directoryPath, newName);

  const stats = await fs.stat(oldPath);
  if (!stats.isFile()) {
    throw new Error(`"${oldName}" is not a file.`);
  }

  try {
    await fs.access(newPath);
    throw new Error(`A file named "${newName}" already exists.`);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
  }

  await fs.rename(oldPath, newPath);

  return { oldName, newName };
}
