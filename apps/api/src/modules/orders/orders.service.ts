import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import type { CreateOrderInput } from '@only-horses/shared-types';

import { ApiException } from '../../common/filters/api-exception.filter.js';
import { DatabaseService } from '../../database/database.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { PAYMENT_PROVIDER, type PaymentProvider } from './payment.provider.js';

/**
 * Buying a product.
 *
 * The lifecycle is a table rather than a chain of ifs, for the same reason
 * §5's is: a transition that is not in it is a 409, not a silent no-op, and
 * the table is the only place the rules live.
 *
 * What is different here, and what the listing lifecycle never had to model,
 * is that an order has *two* parties and they may not press the same buttons.
 * The seller confirms and ships; the buyer pays and receives. Getting that
 * backwards is not a cosmetic bug — a seller who can mark an order "received"
 * can close a dispute they are a party to, and a buyer who can mark it
 * "shipped" can force a payout. So each transition names its actor and the
 * check is on the row, not on the request.
 */
type Actor = 'buyer' | 'seller';

interface Transition {
  from: string[];
  to: string;
  by: Actor;
}

interface OrderRow {
  id: string;
  reference: string;
  status: string;
  payment_status: string;
  buyer_profile_id: string;
  seller_profile_id: string;
  product_id: string;
  title_snapshot: string;
  total_amount: string;
  currency: string;
  payment_reference: string | null;
}

@Injectable()
export class OrdersService {
  constructor(
    private readonly db: DatabaseService,
    private readonly notifications: NotificationsService,
    @Inject(PAYMENT_PROVIDER) private readonly payments: PaymentProvider,
  ) {}

  /**
   * Every move either party can make, and from where.
   *
   * `pay` is absent: it is not a status flip but a call to the processor
   * followed by a stock decrement, and it lives in `pay()` behind
   * `pay_product_order`. Putting it here would suggest it can be done with an
   * UPDATE, which is exactly the mistake that loses the stock arithmetic.
   *
   * `cancel` is absent for the same shape of reason — it has to put stock back
   * and decide between "cancelled" and "refunded" — and lives in `cancel()`.
   */
  private static readonly TRANSITIONS: Record<string, Transition> = {
    accept: { from: ['pending_seller'], to: 'awaiting_payment', by: 'seller' },
    reject: { from: ['pending_seller'], to: 'cancelled', by: 'seller' },
    ship: { from: ['paid'], to: 'shipped', by: 'seller' },
    // Only the buyer closes it. §22's North Star is counted from a completed
    // sale, and a seller-confirmed delivery is a number the seller writes.
    confirm: { from: ['shipped'], to: 'completed', by: 'buyer' },
  };

  private async load(orderId: string, profileId: string): Promise<OrderRow> {
    const rows = await this.db.queryAs<OrderRow>(
      profileId,
      `SELECT id, reference, status, payment_status, buyer_profile_id, seller_profile_id,
              product_id, title_snapshot, total_amount, currency, payment_reference
         FROM product_orders
        WHERE id = $1`,
      [orderId],
    );

    // RLS already restricts this to the two parties, so "not found" and "not
    // yours" are the same answer here — and that is the right answer to give:
    // confirming an order exists to somebody who is not on it leaks that it
    // does.
    const order = rows[0];
    if (!order) throw ApiException.notFound('Sipariş');
    return order;
  }

  /** §12 POST /orders — the buyer places it. */
  async create(
    buyerId: string,
    input: CreateOrderInput,
  ): Promise<{ id: string; reference: string; total: number }> {
    const rows = await this.db.queryAs<{ id: string; reference: string; total: string }>(
      buyerId,
      `SELECT * FROM place_product_order($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        input.productId,
        buyerId,
        input.quantity,
        input.shipToName ?? null,
        input.shipToPhone ?? null,
        input.shipToLine1 ?? null,
        input.shipToCity ?? null,
        input.shipToRegion ?? null,
        input.shipToPostcode ?? null,
        input.note ?? null,
      ],
    ).catch((error: unknown) => {
      throw this.translate(error);
    });

    const order = rows[0];
    if (!order) {
      throw new ApiException(
        'INTERNAL_ERROR',
        'Sipariş oluşturulamadı.',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    const seller = await this.db.queryAs<{ seller_profile_id: string }>(
      buyerId,
      `SELECT seller_profile_id FROM product_orders WHERE id = $1`,
      [order.id],
    );

    if (seller[0]) {
      await this.tell(seller[0].seller_profile_id, 'order_placed', 'Yeni sipariş', {
        body: `${order.reference} — onayını bekliyor.`,
        orderId: order.id,
        reference: order.reference,
      });
    }

    return { id: order.id, reference: order.reference, total: Number(order.total) };
  }

  /**
   * Postgres speaks in SQLSTATEs; §12 speaks in codes a client can branch on.
   *
   * Without this every one of these arrives as INTERNAL_ERROR and the buyer is
   * told "bir şeyler ters gitti" when the honest answer is "there is one left
   * and you asked for two".
   */
  private translate(error: unknown): ApiException {
    const message = error instanceof Error ? error.message : String(error);

    if (message.includes('INSUFFICIENT_STOCK')) {
      return ApiException.validation('Bu üründen istediğin adet kalmadı.');
    }
    if (message.includes('PRODUCT_NOT_AVAILABLE')) {
      return ApiException.conflict('Bu ürün artık satışta değil.');
    }
    if (message.includes('CANNOT_BUY_OWN_PRODUCT')) {
      return ApiException.validation('Kendi ürününü satın alamazsın.');
    }
    if (message.includes('PRODUCT_HAS_NO_PRICE')) {
      return ApiException.validation(
        'Bu ürün "fiyat sorunuz" olarak yayınlanmış. Satıcıya yazman gerekiyor.',
      );
    }
    if (message.includes('PRODUCT_NOT_FOUND')) return ApiException.notFound('Ürün');
    if (message.includes('ORDER_NOT_FOUND')) return ApiException.notFound('Sipariş');
    if (message.includes('ORDER_NOT_PAYABLE')) {
      return ApiException.conflict('Bu sipariş şu anda ödenebilir durumda değil.');
    }
    if (message.includes('ORDER_NOT_CANCELLABLE')) {
      return ApiException.conflict('Bu sipariş artık iptal edilemez.');
    }

    return new ApiException(
      'INTERNAL_ERROR',
      'İşlem tamamlanamadı.',
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }

  /** Accept, reject, ship, confirm — the plain status moves. */
  async transition(
    profileId: string,
    orderId: string,
    action: string,
    detail?: { trackingNote?: string },
  ): Promise<{ status: string }> {
    const rule = OrdersService.TRANSITIONS[action];
    if (!rule) throw ApiException.validation('Bilinmeyen işlem.');

    const order = await this.load(orderId, profileId);
    const actor: Actor | null =
      order.seller_profile_id === profileId
        ? 'seller'
        : order.buyer_profile_id === profileId
          ? 'buyer'
          : null;

    if (actor !== rule.by) {
      throw ApiException.forbidden(
        rule.by === 'seller'
          ? 'Bu işlemi yalnızca satıcı yapabilir.'
          : 'Bu işlemi yalnızca alıcı yapabilir.',
      );
    }

    if (!rule.from.includes(order.status)) {
      throw ApiException.conflict(
        `Bu sipariş "${order.status}" durumundayken bu işlem yapılamaz.`,
        { from: order.status, action },
      );
    }

    await this.db.queryAs(
      profileId,
      `UPDATE product_orders
          SET status        = $2::order_status,
              shipped_at    = CASE WHEN $2 = 'shipped'   THEN now() ELSE shipped_at END,
              completed_at  = CASE WHEN $2 = 'completed' THEN now() ELSE completed_at END,
              cancelled_at  = CASE WHEN $2 = 'cancelled' THEN now() ELSE cancelled_at END,
              tracking_note = COALESCE($3, tracking_note)
        WHERE id = $1`,
      [orderId, rule.to, detail?.trackingNote ?? null],
    );

    await this.announce(order, action, rule);
    return { status: rule.to };
  }

  /** The other party is the one who needs telling. */
  private async announce(order: OrderRow, action: string, rule: Transition): Promise<void> {
    const audience = rule.by === 'seller' ? order.buyer_profile_id : order.seller_profile_id;

    const copy: Record<string, { title: string; body: string }> = {
      accept: {
        title: 'Siparişin onaylandı',
        body: `${order.title_snapshot} — ödeme adımına geçebilirsin.`,
      },
      reject: {
        title: 'Siparişin reddedildi',
        body: `${order.title_snapshot} — satıcı bu siparişi karşılayamadı.`,
      },
      ship: {
        title: 'Siparişin yolda',
        body: `${order.title_snapshot} — satıcı gönderdi.`,
      },
      confirm: {
        title: 'Sipariş tamamlandı',
        body: `${order.reference} — alıcı teslim aldığını onayladı.`,
      },
    };

    const text = copy[action];
    if (!text) return;

    await this.tell(audience, 'order_update', text.title, {
      body: text.body,
      orderId: order.id,
      reference: order.reference,
    });
  }

  /**
   * One place that knows how an order notification is shaped.
   *
   * §21 lets the recipient turn channels off, and `dispatch` honours that —
   * so this passes both channels and lets the preference decide, rather than
   * deciding here that an order is important enough to push regardless.
   */
  private async tell(
    profileId: string,
    type: string,
    title: string,
    detail: { body: string; orderId: string; reference: string },
  ): Promise<void> {
    await this.notifications.dispatch({
      profileId,
      type,
      title,
      body: detail.body,
      data: { orderId: detail.orderId, reference: detail.reference },
      channels: ['in_app', 'push'],
    });
  }

  /**
   * Pay for an accepted order.
   *
   * Two calls to the provider, then one call to the database. The database
   * call is where the stock moves, and it is idempotent by design — a
   * redelivered webhook or a double-tapped button takes the unit once (§24.10).
   */
  async pay(
    buyerId: string,
    orderId: string,
    returnUrl: string,
  ): Promise<{ status: string; remaining: number; provider: string; redirectUrl: string | null }> {
    const order = await this.load(orderId, buyerId);

    if (order.buyer_profile_id !== buyerId) {
      throw ApiException.forbidden('Bu siparişi yalnızca alıcı ödeyebilir.');
    }

    const intent = await this.payments.createIntent({
      orderId: order.id,
      reference: order.reference,
      buyerProfileId: order.buyer_profile_id,
      sellerProfileId: order.seller_profile_id,
      amount: Number(order.total_amount),
      currency: order.currency,
      returnUrl,
    });

    // A real processor answers `requires_action`, and the buyer has to go and
    // do it. Nothing moves here; the capture happens when the provider says so.
    if (intent.status === 'requires_action') {
      await this.db.queryAs(
        buyerId,
        `UPDATE product_orders SET payment_status = 'pending', payment_provider = $2
          WHERE id = $1`,
        [orderId, this.payments.name],
      );

      return {
        status: order.status,
        remaining: -1,
        provider: this.payments.name,
        redirectUrl: intent.redirectUrl,
      };
    }

    const result = await this.payments.confirm(intent.id);

    if (result.status === 'failed') {
      await this.db.queryAs(
        buyerId,
        `UPDATE product_orders SET payment_status = 'failed' WHERE id = $1`,
        [orderId],
      );
      throw ApiException.validation(result.failureMessage ?? 'Ödeme alınamadı.');
    }

    const rows = await this.db
      .queryAs<{ status: string; remaining: number }>(
        buyerId,
        `SELECT * FROM pay_product_order($1,$2,$3,$4)`,
        [orderId, buyerId, this.payments.name, result.reference],
      )
      .catch((error: unknown) => {
        throw this.translate(error);
      });

    await this.tell(order.seller_profile_id, 'order_paid', 'Ödeme alındı', {
      body: `${order.reference} — kargoya verebilirsin.`,
      orderId: order.id,
      reference: order.reference,
    });

    return {
      status: rows[0]?.status ?? 'paid',
      remaining: rows[0]?.remaining ?? 0,
      provider: this.payments.name,
      redirectUrl: null,
    };
  }

  /**
   * Cancel, or refund if it was already paid.
   *
   * Either party may. A buyer changes their mind; a seller drops a bottle of
   * fly spray on the saddle. What neither may do is end an order that is
   * already finished, which is the function's job to refuse.
   */
  async cancel(profileId: string, orderId: string, reason?: string): Promise<{ status: string }> {
    const order = await this.load(orderId, profileId);

    if (order.payment_status === 'paid' && order.payment_reference) {
      const refund = await this.payments.refund({
        reference: order.payment_reference,
        amount: Number(order.total_amount),
        currency: order.currency,
        reason,
      });

      // The row stays as it is if the money did not come back. An order marked
      // refunded with no refund behind it is worse than a failed cancel: it
      // reads as settled to everybody who looks at it afterwards.
      if (refund.status === 'failed') {
        throw ApiException.conflict('İade alınamadı. Destek ile iletişime geç.');
      }
    }

    const rows = await this.db
      .queryAs<{ status: string }>(
        profileId,
        `SELECT * FROM unwind_product_order($1,$2,$3)`,
        [orderId, profileId, reason ?? null],
      )
      .catch((error: unknown) => {
        throw this.translate(error);
      });

    const other =
      order.buyer_profile_id === profileId ? order.seller_profile_id : order.buyer_profile_id;

    await this.tell(
      other,
      'order_update',
      rows[0]?.status === 'refunded' ? 'Sipariş iade edildi' : 'Sipariş iptal edildi',
      { body: `${order.reference} — ${order.title_snapshot}`, orderId: order.id, reference: order.reference },
    );

    return { status: rows[0]?.status ?? 'cancelled' };
  }

  /** The buyer's orders, and the seller's — same shape, different side. */
  async listMine(profileId: string, side: 'buyer' | 'seller'): Promise<unknown[]> {
    const column = side === 'buyer' ? 'buyer_profile_id' : 'seller_profile_id';
    const counterparty = side === 'buyer' ? 'seller_profile_id' : 'buyer_profile_id';

    return this.db.queryAs(
      profileId,
      `SELECT o.id, o.reference, o.status, o.payment_status, o.quantity,
              o.title_snapshot, o.unit_price_amount, o.total_amount, o.currency,
              o.delivery, o.tracking_note, o.created_at, o.paid_at, o.shipped_at,
              o.completed_at, o.cancel_reason,
              p.slug AS product_slug,
              c.display_name AS counterparty_name,
              c.handle AS counterparty_handle
         FROM product_orders o
         JOIN product_listings p ON p.id = o.product_id
         JOIN profiles c ON c.id = o.${counterparty}
        WHERE o.${column} = $1
        ORDER BY o.created_at DESC`,
      [profileId],
    );
  }

  async byId(profileId: string, orderId: string): Promise<unknown> {
    const rows = await this.db.queryAs(
      profileId,
      `SELECT o.*, p.slug AS product_slug,
              s.display_name AS seller_name, s.handle AS seller_handle,
              b.display_name AS buyer_name, b.handle AS buyer_handle
         FROM product_orders o
         JOIN product_listings p ON p.id = o.product_id
         JOIN profiles s ON s.id = o.seller_profile_id
         JOIN profiles b ON b.id = o.buyer_profile_id
        WHERE o.id = $1`,
      [orderId],
    );

    if (!rows[0]) throw ApiException.notFound('Sipariş');
    return rows[0];
  }
}
