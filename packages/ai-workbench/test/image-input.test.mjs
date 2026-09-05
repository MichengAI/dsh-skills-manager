import test from "node:test";
import assert from "node:assert/strict";
import { readImageAttachment } from "../lib/client/image-input.js";

function fileOf({ type = "image/png", size, bytes = [65, 66] } = {}) {
  let arrayBufferCalls = 0;
  return {
    type,
    size: size ?? bytes.length,
    name: "资料.png",
    get arrayBufferCalls() { return arrayBufferCalls; },
    async arrayBuffer() {
      arrayBufferCalls += 1;
      return Uint8Array.from(bytes).buffer;
    },
  };
}

test("unsupported or oversized images fail before base64 conversion", async () => {
  const unsupported = fileOf({ type: "image/svg+xml", size: 2 });
  await assert.rejects(
    () => readImageAttachment(unsupported, { mediaTypes: ["image/png"], maxBytesPerImage: 3 }, []),
    (error) => error.code === "unsupported-image-type",
  );
  assert.equal(unsupported.arrayBufferCalls, 0);

  const oversized = fileOf({ size: 4 });
  await assert.rejects(
    () => readImageAttachment(oversized, { mediaTypes: ["image/png"], maxBytesPerImage: 3 }, []),
    (error) => error.code === "image-too-large",
  );
  assert.equal(oversized.arrayBufferCalls, 0);
});

test("valid image attachments return the DSH image content shape", async () => {
  const file = fileOf({ bytes: [65, 66] });
  const attachment = await readImageAttachment(file, {
    mediaTypes: ["image/png"],
    maxCount: 2,
    maxBytesPerImage: 3,
    maxTotalBytes: 4,
  }, []);
  assert.deepEqual(attachment, { type: "image", mediaType: "image/png", data: "QUI=", name: "资料.png" });
});
