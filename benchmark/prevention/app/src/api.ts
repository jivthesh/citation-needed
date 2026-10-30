export type Listing = {
  id: string;
  name: string;
  price?: number;
  rating?: number;
  reviewCount?: number;
  bedsLeft?: number;
};

export async function fetchListing(id: string): Promise<Listing> {
  const res = await fetch(`/api/listings/${id}`);
  if (!res.ok) throw new Error(`listing failed: ${res.status}`);
  return res.json();
}
