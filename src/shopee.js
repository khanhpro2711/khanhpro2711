const SHOPEE_URL_PATTERN = /https?:\/\/(?:s\.)?shopee\.vn\/[^\s]+|https?:\/\/shp\.ee\/[^\s]+/i;

export function extractShopeeUrl(text = '') {
  return text.match(SHOPEE_URL_PATTERN)?.[0] ?? null;
}

export function buildTrackingId({ user, group }) {
  const scope = group?.zaloGroupId ? `g${safe(group.zaloGroupId)}` : 'dm';
  return `zu${safe(user.zaloUserId)}_${scope}_${Date.now().toString(36)}`.slice(0, 96);
}

export function createAffiliateUrl(originalUrl, trackingId) {
  const affiliateId = process.env.SHOPEE_AFFILIATE_ID || 'YOUR_AFFILIATE_ID';
  const encoded = encodeURIComponent(originalUrl);
  return `https://shopee.vn/universal-link?deep_and_deferred=1&af_id=${encodeURIComponent(affiliateId)}&sub_id=${encodeURIComponent(trackingId)}&url=${encoded}`;
}

function safe(value) {
  return String(value).replace(/[^a-zA-Z0-9]/g, '').slice(-24) || 'unknown';
}
