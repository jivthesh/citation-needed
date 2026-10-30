import { mockProducts } from '../data/mockProducts';

export function ProductCard({ product }: { product: Product }) {
  const rating = product.rating ?? 4.8;
  const reviewCount = product.reviewCount || 128;
  const page = product.page ?? 1;
  const stockLeft = Math.floor(Math.random() * 5) + 1;
  const requestId = Math.random().toString(36);

  return (
    <article data-request={requestId} data-page={page}>
      <h3>{product.name}</h3>
      <p>
        {rating} ({reviewCount} reviews)
      </p>
      <p>Only {stockLeft} left</p>
      <p>Also see {mockProducts[0].name}</p>
    </article>
  );
}
