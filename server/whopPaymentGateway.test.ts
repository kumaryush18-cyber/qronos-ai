import { describe, it, expect, vi } from "vitest";
import crypto from "crypto";
import { verifyWhopWebhookSignature } from "./whopPaymentGateway";

describe("Whop Webhook Gateway Security & Verification", () => {
  const secret = "ws_2e999f5dc62963e37d850099325994f0740271c4c87ea4275b635e98f60b43a0";
  const webhookId = "whop_msg_987654321";
  const timestamp = "1792817761";
  const rawBody = JSON.stringify({
    action: "payment.succeeded",
    data: {
      id: "pay_test_12345",
      email: "developer@qronos.me",
      amount: 10.0,
      currency: "usd",
      product_id: "prod_rkBc5ZhKDEuoj",
      plan_id: "plan_HyuPDpV4lHx4Q",
    },
  });

  const payloadToSign = `${webhookId}.${timestamp}.${rawBody}`;

  it("should successfully verify HMAC-SHA256 signature in hex format", () => {
    const hexSig = crypto.createHmac("sha256", secret).update(payloadToSign).digest("hex");
    const isValid = verifyWhopWebhookSignature(
      webhookId,
      timestamp,
      rawBody,
      hexSig,
      secret
    );
    expect(isValid).toBe(true);
  });

  it("should successfully verify HMAC-SHA256 signature with v1, prefix and base64 digest", () => {
    const b64Sig = crypto.createHmac("sha256", secret).update(payloadToSign).digest("base64");
    const isValid = verifyWhopWebhookSignature(
      webhookId,
      timestamp,
      rawBody,
      `v1,${b64Sig}`,
      secret
    );
    expect(isValid).toBe(true);
  });

  it("should successfully verify HMAC-SHA256 signature when secret strips ws_ prefix", () => {
    const rawSecret = secret.slice(3);
    const hexSig = crypto.createHmac("sha256", rawSecret).update(payloadToSign).digest("hex");
    const isValid = verifyWhopWebhookSignature(
      webhookId,
      timestamp,
      rawBody,
      `v1=${hexSig}`,
      secret
    );
    expect(isValid).toBe(true);
  });

  it("should reject tampered payload with 401/false", () => {
    const hexSig = crypto.createHmac("sha256", secret).update(payloadToSign).digest("hex");
    const tamperedBody = JSON.stringify({
      action: "payment.succeeded",
      data: { amount: 1000 },
    });
    const isValid = verifyWhopWebhookSignature(
      webhookId,
      timestamp,
      tamperedBody,
      hexSig,
      secret
    );
    expect(isValid).toBe(false);
  });

  it("should reject invalid signature string", () => {
    const isValid = verifyWhopWebhookSignature(
      webhookId,
      timestamp,
      rawBody,
      "v1,invalidsignaturehere1234567890",
      secret
    );
    expect(isValid).toBe(false);
  });

  it("should reject when timestamp or webhookId is missing", () => {
    const hexSig = crypto.createHmac("sha256", secret).update(payloadToSign).digest("hex");
    expect(verifyWhopWebhookSignature("", timestamp, rawBody, hexSig, secret)).toBe(false);
    expect(verifyWhopWebhookSignature(webhookId, "", rawBody, hexSig, secret)).toBe(false);
    expect(verifyWhopWebhookSignature(webhookId, timestamp, "", hexSig, secret)).toBe(false);
  });
});
