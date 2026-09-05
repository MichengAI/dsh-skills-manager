const DEFAULT_MEDIA_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];

function firstFinite(values, fallback) {
  return values.find((value) => Number.isFinite(value) && value >= 0) ?? fallback;
}

function advertisedTypes(imageLimits) {
  const value = imageLimits?.mediaTypes ?? imageLimits?.mimeTypes ?? imageLimits?.types;
  if (!Array.isArray(value)) return DEFAULT_MEDIA_TYPES;
  return value.map((item) => typeof item === "string" ? item : item?.mediaType || item?.type)
    .filter((item) => typeof item === "string");
}

export function normalizeImageLimits(imageLimits = {}) {
  return {
    mediaTypes: new Set(advertisedTypes(imageLimits)),
    maxCount: firstFinite([imageLimits.maxCount, imageLimits.count, imageLimits.maxImages], 20),
    maxBytesPerImage: firstFinite([
      imageLimits.maxBytesPerImage,
      imageLimits.perImageBytes,
      imageLimits.maxBytes,
    ], 10 * 1024 * 1024),
    maxTotalBytes: firstFinite([
      imageLimits.maxTotalBytes,
      imageLimits.totalBytes,
      imageLimits.maxBytesTotal,
    ], 20 * 1024 * 1024),
  };
}

function imageError(message, code) {
  return Object.assign(new Error(message), { code });
}

function attachmentBytes(attachments) {
  return (Array.isArray(attachments) ? attachments : []).reduce((total, item) => {
    if (Number.isFinite(item?.byteLength)) return total + item.byteLength;
    if (typeof item?.data !== "string") return total;
    return total + Math.floor(item.data.length * 3 / 4) - (item.data.endsWith("==") ? 2 : item.data.endsWith("=") ? 1 : 0);
  }, 0);
}

export function validateImageFile(file, imageLimits = {}, existingAttachments = []) {
  const limits = normalizeImageLimits(imageLimits);
  if (!file || typeof file !== "object") throw imageError("请选择图片文件", "invalid-image-file");
  if (!limits.mediaTypes.has(file.type)) throw imageError("暂不支持这种图片格式", "unsupported-image-type");
  if (!Number.isFinite(file.size) || file.size < 0) throw imageError("无法读取图片大小", "invalid-image-size");
  if (existingAttachments.length >= limits.maxCount) throw imageError("已达到图片数量上限", "image-count-exceeded");
  if (file.size > limits.maxBytesPerImage) throw imageError("图片超过单张大小限制", "image-too-large");
  if (attachmentBytes(existingAttachments) + file.size > limits.maxTotalBytes) {
    throw imageError("图片总大小超过限制", "image-total-too-large");
  }
  return { limits, byteLength: file.size };
}

function toBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  if (typeof btoa === "function") {
    let binary = "";
    const chunkSize = 0x8000;
    for (let offset = 0; offset < bytes.length; offset += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
    }
    return btoa(binary);
  }
  if (typeof Buffer !== "undefined") return Buffer.from(bytes).toString("base64");
  throw imageError("当前环境不支持图片编码", "image-encoding-unavailable");
}

export async function readImageAttachment(file, imageLimits = {}, existingAttachments = []) {
  validateImageFile(file, imageLimits, existingAttachments);
  if (typeof file.arrayBuffer !== "function") throw imageError("无法读取图片内容", "invalid-image-file");
  const data = toBase64(await file.arrayBuffer());
  return {
    type: "image",
    mediaType: file.type,
    data,
    ...(typeof file.name === "string" && file.name ? { name: file.name.slice(0, 255) } : {}),
  };
}

export function withoutAttachmentSize(attachment) {
  if (!attachment || typeof attachment !== "object") return attachment;
  const { byteLength, ...content } = attachment;
  return content;
}
