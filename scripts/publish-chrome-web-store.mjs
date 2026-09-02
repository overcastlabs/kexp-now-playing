#!/usr/bin/env node

import { readFile } from "node:fs/promises";

const packagePath = process.argv[2];
const {
  CWS_ACCESS_TOKEN: accessToken,
  CWS_PUBLISHER_ID: publisherId,
  CWS_EXTENSION_ID: extensionId,
  EXPECTED_VERSION: expectedVersion,
} = process.env;

for (const [name, value] of Object.entries({
  packagePath,
  CWS_ACCESS_TOKEN: accessToken,
  CWS_PUBLISHER_ID: publisherId,
  CWS_EXTENSION_ID: extensionId,
})) {
  if (!value) throw new Error(`Missing required value: ${name}`);
}

const itemName = `publishers/${encodeURIComponent(publisherId)}/items/${encodeURIComponent(extensionId)}`;
const apiRoot = "https://chromewebstore.googleapis.com";
const authHeaders = { Authorization: `Bearer ${accessToken}` };

async function requestJson(url, options = {}) {
  const response = await fetch(url, options);
  const body = await response.text();
  let data = {};

  if (body) {
    try {
      data = JSON.parse(body);
    } catch {
      data = { rawResponse: body };
    }
  }

  if (!response.ok) {
    throw new Error(`${options.method ?? "GET"} ${url} failed (${response.status}): ${JSON.stringify(data)}`);
  }

  return data;
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

const packageData = await readFile(packagePath);
console.log(`Uploading ${packagePath} to Chrome Web Store…`);

const upload = await requestJson(`${apiRoot}/upload/v2/${itemName}:upload`, {
  method: "POST",
  headers: {
    ...authHeaders,
    "Content-Type": "application/zip",
  },
  body: packageData,
});

let uploadState = upload.uploadState;
let uploadedVersion = upload.crxVersion;

for (let attempt = 1; ["IN_PROGRESS", "UPLOAD_IN_PROGRESS"].includes(uploadState) && attempt <= 24; attempt += 1) {
  console.log(`Upload is still processing (check ${attempt}/24)…`);
  await sleep(5000);

  const status = await requestJson(`${apiRoot}/v2/${itemName}:fetchStatus`, {
    headers: authHeaders,
  });

  uploadState = status.lastAsyncUploadState;
  const channels = status.submittedItemRevisionStatus?.distributionChannels ?? [];
  uploadedVersion ||= channels.find((channel) => channel.crxVersion)?.crxVersion;
}

if (uploadState !== "SUCCEEDED") {
  throw new Error(`Chrome Web Store upload did not succeed. Final state: ${uploadState ?? "unknown"}`);
}

if (expectedVersion && uploadedVersion && uploadedVersion !== expectedVersion) {
  throw new Error(`Uploaded version ${uploadedVersion} does not match expected version ${expectedVersion}`);
}

console.log(`Uploaded extension version ${uploadedVersion ?? expectedVersion ?? "unknown"}. Submitting for review…`);

const publication = await requestJson(`${apiRoot}/v2/${itemName}:publish`, {
  method: "POST",
  headers: {
    ...authHeaders,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    publishType: "DEFAULT_PUBLISH",
    blockOnWarnings: false,
  }),
});

console.log(`Chrome Web Store submission state: ${publication.state ?? "submitted"}`);

for (const warning of publication.warningInfo?.warnings ?? []) {
  console.warn(`Warning (${warning.reason ?? "unknown"}): ${warning.description ?? "No description"}`);
}
