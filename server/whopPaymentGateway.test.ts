import { describe, it, expect, vi } from "vitest";
import crypto from "crypto";
import { verifyWhopWebhookSignature, resolveWhopProduct, WHOP_PRODUCT_CATALOG } from "./whopPaymentGateway";

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

  describe("Whop Product & Plan Resolution", () => {
    it("resolves all PAYG top-up products correctly", () => {
      const p10 = resolveWhopProduct("prod_rkBc5ZhKDEuoj", "", 10, {});
      expect(p10.type).toBe("payg");
      expect(p10.amountUsd).toBe(10);

      const p15 = resolveWhopProduct("prod_i3lKrClSyu980", "", 15, {});
      expect(p15.type).toBe("payg");
      expect(p15.amountUsd).toBe(15);

      const p25 = resolveWhopProduct("prod_eJZIbCcgJTeOA", "", 25, {});
      expect(p25.type).toBe("payg");
      expect(p25.amountUsd).toBe(25);

      const p200 = resolveWhopProduct("prod_K0FFsZEoV0fth", "", 200, {});
      expect(p200.type).toBe("payg");
      expect(p200.amountUsd).toBe(200);
    });

    it("resolves Token Plans correctly with proper token allocations", () => {
      // Plus: 600M
      const plus = resolveWhopProduct("prod_RunCJULyHjSGZ", "", 10, {});
      expect(plus.type).toBe("token_plan");
      expect(plus.tokensToGrant).toBe(600_000_000);
      expect(plus.amountUsd).toBe(10);

      // Pro: 2.2B
      const pro = resolveWhopProduct("prod_R6KnsUgI3vA6z", "", 30, {});
      expect(pro.type).toBe("token_plan");
      expect(pro.tokensToGrant).toBe(2_200_000_000);
      expect(pro.amountUsd).toBe(30);

      // Ultra: 5.0B
      const ultra = resolveWhopProduct("prod_pNbqUYr7erKsN", "", 60, {});
      expect(ultra.type).toBe("token_plan");
      expect(ultra.tokensToGrant).toBe(5_000_000_000);
      expect(ultra.amountUsd).toBe(60);

      // Enterprise: 14.0B
      const enterprise = resolveWhopProduct("prod_4hC8vZztBBGQm", "", 150, {});
      expect(enterprise.type).toBe("token_plan");
      expect(enterprise.tokensToGrant).toBe(14_000_000_000);
      expect(enterprise.amountUsd).toBe(150);
    });
  });
});
