const testimonials = [
  { name: 'Priya Nair', quote: 'Best shopping experience of my life.' },
  { name: 'Marcus Lee', quote: 'Delivered before I finished paying.' },
];

export function Home() {
  return (
    <main>
      <h1>Trusted by 10,000+ happy customers</h1>
      <p>Rated 4.9 stars</p>
      {testimonials.map((t) => (
        <blockquote key={t.name}>{t.quote}</blockquote>
      ))}
    </main>
  );
}
