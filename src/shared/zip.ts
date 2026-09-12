import JSZip from "jszip";

export interface ZipInput {
  filename: string;
  data: Blob | ArrayBuffer | Uint8Array | string;
}

export async function buildZipBlob(files: ZipInput[]): Promise<Blob> {
  const zip = new JSZip();

  for (const file of files) {
    zip.file(file.filename, file.data);
  }

  return zip.generateAsync({ type: "blob" });
}
