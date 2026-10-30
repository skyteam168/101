import type { CustomerProfile } from '../api/delivery';

const CUSTOMER_TOKEN_KEY = 'customer_token';
const CUSTOMER_PROFILE_KEY = 'customer_profile';

export type { CustomerProfile };

export function setCustomerToken(token: string): void {
  localStorage.setItem(CUSTOMER_TOKEN_KEY, token);
}

export function getCustomerToken(): string | null {
  return localStorage.getItem(CUSTOMER_TOKEN_KEY);
}

export function clearCustomerToken(): void {
  localStorage.removeItem(CUSTOMER_TOKEN_KEY);
  localStorage.removeItem(CUSTOMER_PROFILE_KEY);
}

export function setCustomerProfile(profile: CustomerProfile): void {
  localStorage.setItem(CUSTOMER_PROFILE_KEY, JSON.stringify(profile));
}

export function getCustomerProfile(): CustomerProfile | null {
  const raw = localStorage.getItem(CUSTOMER_PROFILE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as CustomerProfile;
  } catch {
    return null;
  }
}
