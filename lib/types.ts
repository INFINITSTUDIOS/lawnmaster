import type { Polygon } from "geojson";

export const FREQUENCIES = ["weekly", "biweekly", "triweekly", "monthly"] as const;
export type Frequency = (typeof FREQUENCIES)[number];

export const FREQUENCY_LABEL: Record<Frequency, string> = {
  weekly: "Every week",
  biweekly: "Every 2 weeks",
  triweekly: "Every 3 weeks",
  monthly: "Once a month",
};

export const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export type Company = {
  id: string;
  name: string;
  slug: string;
  tagline: string | null;
  phone: string | null;
  logo_url: string | null;
  brand_color: string;
  map_center_lng: number | null;
  map_center_lat: number | null;
  stripe_account_id: string | null;
  stripe_charges_enabled: boolean;
  platform_fee_percent: number;
};

export type ServiceArea = {
  id: string;
  company_id: string;
  name: string;
  boundary: Polygon;
  service_weekdays: number[];
  daily_capacity: number | null;
  active: boolean;
};

export type LawnTier = {
  id: string;
  company_id: string;
  name: string;
  min_sqft: number;
  max_sqft: number | null;
};

export type MowingPrice = {
  area_id: string;
  tier_id: string;
  frequency: Frequency;
  price_cents: number;
};

export type Addon = {
  id: string;
  company_id: string;
  name: string;
  description: string | null;
  price_cents: number;
  active: boolean;
};

export type Customer = {
  id: string;
  company_id: string;
  user_id: string;
  email: string;
  full_name: string;
  phone: string | null;
  address: string;
  lng: number;
  lat: number;
  lawn_outline: Polygon | null;
  lawn_sqft: number | null;
  tier_id: string | null;
  area_id: string | null;
  stripe_customer_id: string | null;
  created_at: string;
};

export type SubscriptionStatus = "pending" | "active" | "past_due" | "canceled";

export type Subscription = {
  id: string;
  company_id: string;
  customer_id: string;
  area_id: string;
  frequency: Frequency;
  price_cents: number;
  start_date: string;
  status: SubscriptionStatus;
  stripe_subscription_id: string | null;
  stripe_checkout_session_id: string | null;
};

export type Visit = {
  id: string;
  company_id: string;
  subscription_id: string;
  customer_id: string;
  area_id: string;
  original_date: string;
  visit_date: string;
  status: "scheduled" | "completed" | "skipped";
};

export type AddonOrder = {
  id: string;
  company_id: string;
  customer_id: string;
  addon_id: string | null;
  name: string;
  price_cents: number;
  status: "pending" | "paid" | "completed" | "canceled";
  stripe_checkout_session_id: string | null;
  created_at: string;
};
