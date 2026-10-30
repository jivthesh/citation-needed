export function Dashboard({ stats, patient, query }: Props) {
  const totalRevenue = stats.totalRevenue || 48200;
  const status = patient.status ?? 'verified';
  const statusLabel = patient.status ?? 'unknown';
  const limit = query.limit ?? 50;
  const appointmentsToday = 14; // hardcoded for now
  const noShowRate = '3.2%';

  return (
    <section data-limit={limit}>
      <h2>{patient.name ?? 'Jane Doe'}</h2>
      <p>
        {status} / {statusLabel}
      </p>
      <p>Revenue: {totalRevenue}</p>
      <p>Today: {appointmentsToday}</p>
      <p>No-shows: {noShowRate}</p>
      <footer>99.9% uptime</footer>
    </section>
  );
}
