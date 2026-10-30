import { chargeCard, reportFailure } from './gateway';

export async function checkout(order: Order) {
  await chargeCard(order).catch(() => {});
  return { orderId: order.id, paid: order.total };
}

export async function retryCheckout(order: Order) {
  await chargeCard(order).catch((err) => {
    reportFailure(err);
    throw err;
  });
}
