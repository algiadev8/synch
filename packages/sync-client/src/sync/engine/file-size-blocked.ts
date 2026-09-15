import { decryptSyncMetadata } from "../core/crypto";
import { metadataContextFromMutation } from "./push-mutation-shared";
import type { SyncStore } from "../store/store";
import type { PendingMutationBlockedReason } from "../store/store";

/** @deprecated Use `SyncBlockedSyncFile`. */
export interface SyncFileSizeBlockedFile {
  path: string;
  encryptedSizeBytes: number | null;
  maxFileSizeBytes: number | null;
}

export interface SyncBlockedSyncFile extends SyncFileSizeBlockedFile {
  reason: PendingMutationBlockedReason;
}

export async function listBlockedSyncFiles(
  store: SyncStore,
  remoteVaultKey: Uint8Array,
): Promise<SyncBlockedSyncFile[]> {
  const mutations = (await Promise.all([
    store.listBlockedDirtyEntriesByReason("file_too_large"),
    store.listBlockedDirtyEntriesByReason("incompatible_path"),
  ])).flat();
  const files: SyncBlockedSyncFile[] = [];
  for (const mutation of mutations) {
    if (mutation.op !== "upsert") {
      continue;
    }

    const metadata = await decryptSyncMetadata(
      remoteVaultKey,
      mutation.encryptedMetadata,
      metadataContextFromMutation(mutation),
    );
    files.push({
      path: metadata.path,
      reason: mutation.blockedReason ?? "file_too_large",
      encryptedSizeBytes: mutation.blockedEncryptedSizeBytes ?? null,
      maxFileSizeBytes: mutation.blockedMaxFileSizeBytes ?? null,
    });
  }

  return files;
}

/** @deprecated Use `listBlockedSyncFiles`. */
export async function listFileSizeBlockedFiles(
  store: SyncStore,
  remoteVaultKey: Uint8Array,
): Promise<SyncFileSizeBlockedFile[]> {
  return await listBlockedSyncFiles(store, remoteVaultKey);
}
