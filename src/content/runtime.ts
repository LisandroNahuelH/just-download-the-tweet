import type {
  DownloadAllRequest,
  DownloadOneRequest,
  DownloadResultMessage,
  DownloadZipRequest,
} from "../shared/download-contract";
import { getMessage } from "../shared/browser/getMessage";

type ChromeRuntimeLike = {
  runtime?: {
    sendMessage?: (message: unknown, responseCallback: (response?: unknown) => void) => void;
    lastError?: { message: string };
  };
};

function getRuntime(): ChromeRuntimeLike["runtime"] | undefined {
  return (globalThis as typeof globalThis & { chrome?: ChromeRuntimeLike }).chrome?.runtime;
}

function sendRuntimeMessage<TResponse>(message: unknown): Promise<TResponse | undefined> {
  const runtime = getRuntime();
  const sendMessage = runtime?.sendMessage;
  if (!sendMessage) {
    return Promise.resolve(undefined);
  }

  return new Promise<TResponse | undefined>((resolve, reject) => {
    sendMessage(message, (response: unknown) => {
      const lastError = runtime.lastError?.message;
      if (lastError) {
        reject(new Error(lastError));
        return;
      }

      resolve(response as TResponse | undefined);
    });
  });
}

export function createRequestId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `req_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

export async function downloadOne(payload: Omit<DownloadOneRequest, "type" | "requestId">): Promise<DownloadResultMessage | undefined> {
  return await sendRuntimeMessage<DownloadResultMessage>({
    ...payload,
    type: "DOWNLOAD_ONE",
    requestId: createRequestId(),
  });
}

export async function downloadAll(payload: Omit<DownloadAllRequest, "type" | "requestId">): Promise<DownloadResultMessage | undefined> {
  return await sendRuntimeMessage<DownloadResultMessage>({
    ...payload,
    type: "DOWNLOAD_ALL",
    requestId: createRequestId(),
  });
}

export async function downloadZip(payload: Omit<DownloadZipRequest, "type" | "requestId">): Promise<DownloadResultMessage | undefined> {
  return await sendRuntimeMessage<DownloadResultMessage>({
    ...payload,
    type: "DOWNLOAD_ZIP",
    requestId: createRequestId(),
  });
}

export function extractDownloadError(result: DownloadResultMessage | undefined): string | null {
  if (!result) {
    return getMessage("noDownloadResponse");
  }

  if (result.ok) {
    return null;
  }

  if (result.error) {
    return result.error;
  }

  const firstFailed = result.files.find((file) => !file.ok);
  return firstFailed?.error ?? getMessage("downloadFailed");
}
