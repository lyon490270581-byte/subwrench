// Hash & id utilities on top of node:crypto.

import crypto from "node:crypto";

export function uuid(n = 1) {
  return Array.from({ length: n }, () => crypto.randomUUID());
}

export function sha256(input, encoding = "utf8") {
  return crypto.createHash("sha256").update(input, encoding).digest("hex");
}

export function sha1(input, encoding = "utf8") {
  return crypto.createHash("sha1").update(input, encoding).digest("hex");
}

export function md5(input, encoding = "utf8") {
  return crypto.createHash("md5").update(input, encoding).digest("hex");
}

export function hmac(algo, secret, input) {
  return crypto.createHmac(algo, secret).update(input).digest("hex");
}

export function base64Encode(input, encoding = "utf8") {
  return Buffer.from(input, encoding).toString("base64");
}

export function base64Decode(input, encoding = "utf8") {
  return Buffer.from(input, "base64").toString(encoding);
}

export function randomHex(bytes = 16) {
  return crypto.randomBytes(bytes).toString("hex");
}
