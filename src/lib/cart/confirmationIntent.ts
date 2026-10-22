export type ConfirmationIntent = "confirm" | "deny" | "none";

/**
 * Classifies a free-text chat message as an explicit confirmation of a
 * pending cart action.
 *
 * Bare "yes" / "ok" / "looks good" / "add it" are deliberately NOT
 * confirmations: they are ambiguous and may refer to something else in
 * the conversation. The reliable confirmation path is the ConsentDialog
 * button (which calls the API with the specific pendingActionId).
 * In chat, only an unambiguous cart-confirmation phrase counts.
 *
 * Product descriptions / tool output are never passed here as user
 * intent — this only classifies actual user messages.
 */
export function classifyConfirmationIntent(raw: string): ConfirmationIntent {
  const text = raw.trim().toLowerCase().replace(/\s+/g, " ");
  if (!text) return "none";

  // Deny first: "don't confirm", "cancel cart add", etc.
  if (
    /^(cancel|deny|reject|no|never mind|do not|don't)\b/.test(text) &&
    /(cancel|deny|reject|never mind|cart|add|pending)/.test(text)
  ) {
    return "deny";
  }
  if (/^(cancel|deny|reject|never mind)\s+(cart add|the )?(cart|add|pending)/.test(text)) {
    return "deny";
  }
  if (text === "cancel" || text === "deny" || text === "reject") return "deny";

  // Explicit confirm: must reference confirming/approving, not just agreement.
  if (
    /^(confirm|approve|authorise|authorize)\b/.test(text) &&
    /(confirm|approve|authorise|authorize)/.test(text) &&
    /(cart|add|pending|that|it|the addition)?/.test(text) &&
    text.length <= 80 &&
    !/^(confirm\?|approve\?)/.test(text)
  ) {
    // Require some explicitness beyond the single word "confirm" alone?
    // Single "confirm"/"approve" after a proposal dialog is acceptable in chat,
    // but bare "yes"/"ok" are not.
    return "confirm";
  }

  return "none";
}

/**
 * Detects an attempt to make ShopSmart itself purchase / check out / pay.
 * Ordinary shopping language ("I want to buy a laptop under ₹50k") is a
 * brief, not an immediate purchase attempt — the patterns require an
 * imperative checkout/payment action.
 */
export function isImmediatePurchaseAttempt(raw: string): boolean {
  const text = raw.trim().toLowerCase();
  return (
    /\b(buy now|checkout|check out|pay now|place (the |an )?order|submit (my |the )?payment|complete (the |my )?purchase|pay for (it|this|that))\b/.test(text) ||
    /\bpurchase (it|this|that|now|immediately)\b/.test(text) ||
    /\border (it|this|that|now)\b/.test(text)
  );
}

export const PURCHASE_REFUSAL_MESSAGE =
  "I can't purchase, check out, or submit payment — ShopSmart never does that, and there is no checkout or payment tool. I can research and compare products, and add an item to your ShopSmart planning cart only after you confirm a specific proposal. When you're ready to buy, use the retailer link in the cart to complete the purchase manually on the retailer's website.";

export function isExplicitConfirmMessage(raw: string): boolean {
  return classifyConfirmationIntent(raw) === "confirm";
}

export function isExplicitDenyMessage(raw: string): boolean {
  return classifyConfirmationIntent(raw) === "deny";
}
