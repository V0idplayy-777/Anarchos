/**
 * Uploads a File/Blob to a Convex storage upload URL with progress reporting.
 * Convex storage accepts a single-part POST with the body as the raw file.
 */
export function uploadToConvex(uploadUrl, file, onProgress, abortRef) {
  return new Promise((resolve, reject) => {
    if (typeof XMLHttpRequest === "undefined") {
      fetch(uploadUrl, { method: "POST", headers: { "Content-Type": file.type }, body: file })
        .then((response) => resolve(response.json()))
        .catch(() => reject(new Error("The upload could not be completed. Try again.")));
      return;
    }
    const request = new XMLHttpRequest();
    if (abortRef) abortRef.current = request;
    request.open("POST", uploadUrl, true);
    request.setRequestHeader("Content-Type", file.type || "application/octet-stream");
    if (request.upload && onProgress) {
      request.upload.onprogress = (event) => {
        if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
      };
    }
    request.onload = () => {
      if (request.status >= 200 && request.status < 300) {
        try {
          resolve(JSON.parse(request.responseText));
        } catch {
          reject(new Error("The upload response could not be read. Try again."));
        }
      } else if (request.status === 413) {
        reject(new Error("That file is too large."));
      } else {
        reject(new Error(`The upload failed (${request.status}). Try again.`));
      }
    };
    request.onerror = () => reject(new Error("Network problem while uploading. Try again."));
    request.onabort = () => reject(Object.assign(new Error("Upload cancelled."), { aborted: true }));
    request.send(file);
  });
}
