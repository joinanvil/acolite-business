import Stripe from "stripe";

export function createStripeClient(): Stripe | null {
  const apiKey = process.env.STRIPE_API_KEY;
  if (!apiKey) return null;
  return new Stripe(apiKey);
}
