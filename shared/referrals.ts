import { PUBLIC_ORIGIN } from "./const";
export const QRONOS_PUBLIC_ORIGIN = PUBLIC_ORIGIN;
export const QRONOS_REFERRAL_COMMISSION_PERCENT = 0;
export const QRONOS_REFERRAL_SIGNUP_TOKENS = 5_000_000;
export const QRONOS_REFERRAL_SIGNUP_TOKENS_DISPLAY = "5M";
export const QRONOS_REFERRAL_SIGNUP_NEW_USER_TOKENS = 5_000_000;
export const QRONOS_REFERRAL_SIGNUP_NEW_USER_TOKENS_DISPLAY = "5M";
export const QRONOS_REFERRAL_SIGNUP_INVITER_TOKENS = 1_000_000;
export const QRONOS_REFERRAL_SIGNUP_INVITER_TOKENS_DISPLAY = "1M";
export const QRONOS_REFERRAL_REWARD_USD = 0;
export const TOKENFORGE_REFERRAL_REWARD_USD = 0;
export const QRONOS_REFERRAL_REWARD_NANOS = 0;
export const TOKENFORGE_REFERRAL_REWARD_NANOS = 0;
export const QRONOS_AFFILIATE_CODE_LENGTH = 4;
export const TOKENFORGE_AFFILIATE_CODE_LENGTH = QRONOS_AFFILIATE_CODE_LENGTH;
/** Public reusable campaign marker; it deliberately does not identify an existing user. */
export const SPECIAL_REFERRAL_CAMPAIGN_CODE = "bonus150";

/** Affiliate codes are compact, lowercase, case-insensitive identifiers. Invalid input is ignored rather than persisted. */
export function normalizeReferralCode(value: string | null | undefined) {
  const code = value?.trim().toLowerCase() ?? "";
  return new RegExp(`^[a-z0-9]{${QRONOS_AFFILIATE_CODE_LENGTH}}$`).test(code) ? code : undefined;
}

export function isSpecialReferralCampaignCode(value: string | null | undefined) {
  return value?.trim().toLowerCase() === SPECIAL_REFERRAL_CAMPAIGN_CODE;
}

/** Accepts either a standard four-character affiliate code or the public special campaign marker. */
export function normalizeReferralCampaignCode(value: string | null | undefined) {
  return normalizeReferralCode(value) ?? (isSpecialReferralCampaignCode(value) ? SPECIAL_REFERRAL_CAMPAIGN_CODE : undefined);
}

export function buildReferralInviteUrl(code: string) {
  return `${QRONOS_PUBLIC_ORIGIN}/sign-up?aff=${encodeURIComponent(code)}`;
}

export function buildSpecialReferralCampaignUrl() {
  return `${QRONOS_PUBLIC_ORIGIN}/sign-up?aff=${SPECIAL_REFERRAL_CAMPAIGN_CODE}&via=AmirSNet`;
}
