import crypto from 'node:crypto';
import { and, asc, desc, eq, gt, sql } from 'drizzle-orm';
import { db } from '../../lib/db.js';
import { redis } from '../../lib/redis.js';
import { logger } from '../../lib/logger.js';
import {
  batches,
  batchEnrollments,
  courses,
  enrollmentRequests,
  feePlans,
  users,
} from '../../../drizzle/schema.js';
import { enrollStudent } from '../batches/batches.service.js';
import { recordPayment } from '../fees/fees.service.js';
import { sendNotificationToUser } from '../notifications/notifications.service.js';
import { gatewayByName, publicApiUrl, resolveGatewayFor } from '../payments/gateway/index.js';
import type { WebhookEvent } from '../payments/gateway/types.js';

/**
 * Self-enrolment through the in-app bank gateway.
 *
 * The flow is: options → checkout (order at the bank) → the student pays on
 * the bank's page → the bank tells us (webhook) or we ask it (status nudge)
 * → settle. Settlement is the only place money turns into access, and it is
 * idempotent: the bank may call twice, the app may poll while the webhook is
 * landing, and the answer must be one enrolment and one payment row.
 *
 * Nothing the student's browser carries back is trusted. A "success" page in
 * a browser proves nothing; the server's settled state is the only truth the
 * app ever shows.
 */

function err(message: string, statusCode: number, code: string) {
  return Object.assign(new Error(message), { statusCode, code });
}
const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * The batch an online payment for this course lands in: the one an admin
 * switched on, else the earliest batch that is still open and has room. No
 * result means the course is not sellable in the app right now.
 */
async function resolveEnrollingBatch(courseId: string) {
  const candidates = await db
    .select({
      id: batches.id,
      name: batches.name,
      startDate: batches.startDate,
      capacity: batches.capacity,
      enrolling: batches.enrolling,
      active: sql<number>`(select count(*) from ${batchEnrollments} be where be.batch_id = ${batches.id} and be.status = 'active')`,
    })
    .from(batches)
    .where(and(eq(batches.courseId, courseId), sql`${batches.status} in ('upcoming', 'active')`))
    .orderBy(desc(batches.enrolling), asc(batches.startDate));

  const flagged = candidates.find((b) => b.enrolling && Number(b.active) < b.capacity);
  if (flagged) return flagged;
  // Deliberately no silent fallback into an unflagged batch: an admin who has
  // not chosen where paying students go should not have that chosen for them.
  return null;
}

async function alreadyEnrolled(studentId: string, courseId: string) {
  const [row] = await db
    .select({ batchId: batchEnrollments.batchId })
    .from(batchEnrollments)
    .innerJoin(batches, eq(batches.id, batchEnrollments.batchId))
    .where(
      and(
        eq(batchEnrollments.userId, studentId),
        eq(batchEnrollments.status, 'active'),
        eq(batches.courseId, courseId),
      ),
    )
    .limit(1);
  return !!row;
}

// ── Options: what the enrol screen shows before asking for money ────────────
export async function enrolOptions(studentId: string, courseId: string) {
  const [course] = await db
    .select()
    .from(courses)
    .where(and(eq(courses.id, courseId), eq(courses.isPublished, true)))
    .limit(1);
  if (!course) throw err('Course not found', 404, 'COURSE_NOT_FOUND');

  const [student] = await db.select({ phone: users.phone }).from(users).where(eq(users.id, studentId)).limit(1);
  const gateway = student ? resolveGatewayFor(student.phone) : null;
  const batch = await resolveEnrollingBatch(courseId);
  const plans = await db
    .select()
    .from(feePlans)
    .where(and(eq(feePlans.courseId, courseId), eq(feePlans.isActive, true), gt(feePlans.totalAmount, 0)))
    .orderBy(asc(feePlans.totalAmount));

  let unavailableReason: string | null = null;
  if (!gateway) {
    unavailableReason =
      'Online payment is not available yet. Pay at the office or by bank transfer and we will enrol you — you will get a notification the moment your course opens.';
  } else if (!batch) {
    unavailableReason = 'Enrolment for this course opens soon. We will let you know.';
  } else if (course.feeAmount <= 0 && plans.length === 0) {
    unavailableReason = 'This course has no fee set yet. Please contact the office.';
  }

  return {
    courseId: course.id,
    courseTitle: course.title,
    feeAmount: course.feeAmount,
    alreadyEnrolled: await alreadyEnrolled(studentId, courseId),
    canPayOnline: unavailableReason === null,
    unavailableReason,
    provider: gateway?.name ?? null,
    batch: batch ? { id: batch.id, name: batch.name, startDate: batch.startDate } : null,
    plans: plans.map((p) => ({ id: p.id, name: p.name, totalAmount: p.totalAmount, installments: p.installments })),
  };
}

// ── Checkout: create the order at the bank ──────────────────────────────────
export async function startCheckout(
  studentId: string,
  input: { courseId: string; feePlanId?: string; installmentIndex: number },
) {
  const [course] = await db
    .select()
    .from(courses)
    .where(and(eq(courses.id, input.courseId), eq(courses.isPublished, true)))
    .limit(1);
  if (!course) throw err('Course not found', 404, 'COURSE_NOT_FOUND');
  if (await alreadyEnrolled(studentId, input.courseId)) {
    throw err('You are already enrolled in this course', 409, 'ALREADY_ENROLLED');
  }

  const [student] = await db.select().from(users).where(eq(users.id, studentId)).limit(1);
  if (!student) throw err('Student not found', 404, 'NOT_FOUND');

  const gateway = resolveGatewayFor(student.phone);
  if (!gateway) {
    throw err(
      'Online payment is not available yet. Pay at the office or by bank transfer and we will enrol you.',
      503,
      'GATEWAY_UNAVAILABLE',
    );
  }

  const batch = await resolveEnrollingBatch(input.courseId);
  if (!batch) throw err('Enrolment for this course opens soon.', 409, 'NO_OPEN_BATCH');

  // Amount is always resolved here — from the plan installment or the course
  // fee — never taken from the app.
  let amount = round2(course.feeAmount);
  let feePlanId: string | undefined;
  if (input.feePlanId) {
    const [plan] = await db.select().from(feePlans).where(eq(feePlans.id, input.feePlanId)).limit(1);
    if (!plan || plan.courseId !== input.courseId) throw err('Fee plan not found', 400, 'FEE_PLAN_NOT_FOUND');
    const inst = plan.installments[input.installmentIndex];
    if (!inst) throw err('Invalid installment selection', 400, 'INVALID_INSTALLMENT');
    amount = round2(inst.amount);
    feePlanId = plan.id;
  }
  if (amount <= 0) throw err('This course has no fee set yet', 400, 'NO_FEE_CONFIGURED');

  // ≤ 40 chars, URL-safe, provider-prefixed so a callback can be routed to
  // the adapter that minted it without a lookup.
  const orderId = `${gateway.name}_${Date.now().toString(36)}${crypto.randomBytes(6).toString('hex')}`;

  // One live request per student+course. Re-opening checkout replaces the
  // order rather than stacking a second one; a prior failure starts again.
  const [existing] = await db
    .select()
    .from(enrollmentRequests)
    .where(
      and(
        eq(enrollmentRequests.studentId, studentId),
        eq(enrollmentRequests.courseId, input.courseId),
        sql`${enrollmentRequests.status} in ('pending', 'failed')`,
      ),
    )
    .limit(1);

  const values = {
    feePlanId: feePlanId ?? null,
    amount,
    method: 'online' as const,
    channel: 'gateway' as const,
    gatewayOrderId: orderId,
    gatewayPaymentId: null,
    intendedBatchId: batch.id,
    reference: null,
    rejectionReason: null,
    status: 'pending' as const,
    updatedAt: new Date(),
  };
  const [request] = existing
    ? await db.update(enrollmentRequests).set(values).where(eq(enrollmentRequests.id, existing.id)).returning()
    : await db.insert(enrollmentRequests).values({ studentId, courseId: input.courseId, ...values }).returning();

  const base = publicApiUrl();
  const order = await gateway.createOrder({
    orderId,
    amount,
    currency: 'INR',
    description: `${course.title} — ${batch.name}`,
    student: { id: student.id, name: student.name, phone: student.phone, email: student.email },
    returnUrl: `${base}/api/v1/pay/return/${encodeURIComponent(orderId)}`,
    webhookUrl: `${base}/api/v1/payments/webhook/${gateway.name}`,
  });

  return {
    orderId,
    requestId: request!.id,
    amount,
    currency: 'INR',
    provider: gateway.name,
    paymentUrl: order.paymentUrl,
    course: { id: course.id, title: course.title },
    batch: { id: batch.id, name: batch.name, startDate: batch.startDate },
  };
}

// ── Settlement: the one place money becomes access ──────────────────────────
/**
 * Idempotent under retries and races: a Redis lock serialises settlement of
 * one order, and a settled request is left untouched however many times the
 * bank repeats itself. Held as a lock rather than a row lock because
 * enrollStudent opens its own transaction and also touches this row — a
 * SELECT FOR UPDATE here would deadlock against it.
 */
export async function settleGatewayPayment(ev: WebhookEvent) {
  const [request] = await db
    .select()
    .from(enrollmentRequests)
    .where(eq(enrollmentRequests.gatewayOrderId, ev.orderId))
    .limit(1);
  if (!request) {
    logger.warn({ orderId: ev.orderId }, 'gateway callback for unknown order');
    return { status: 'unknown' as const };
  }
  if (request.status === 'verified') return { status: 'paid' as const, already: true };

  if (ev.outcome === 'failed') {
    await db
      .update(enrollmentRequests)
      .set({ status: 'failed', rejectionReason: ev.reason ?? 'Payment failed', updatedAt: new Date() })
      .where(and(eq(enrollmentRequests.id, request.id), eq(enrollmentRequests.status, 'pending')));
    return { status: 'failed' as const };
  }
  if (ev.outcome !== 'paid') return { status: 'pending' as const };

  const lockKey = `settle:${ev.orderId}`;
  const got = await redis.set(lockKey, '1', 'EX', 30, 'NX');
  if (!got) return { status: 'pending' as const, settling: true };

  try {
    // Re-read under the lock: a concurrent settle may have just finished.
    const [fresh] = await db.select().from(enrollmentRequests).where(eq(enrollmentRequests.id, request.id)).limit(1);
    if (!fresh || fresh.status === 'verified') return { status: 'paid' as const, already: true };

    const paymentRef = ev.gatewayPaymentId ?? ev.orderId;
    const batchId = fresh.intendedBatchId ?? (await resolveEnrollingBatch(fresh.courseId))?.id;

    // The bank's word is recorded on the request before anything else, so
    // even if placement fails below the fact of payment is never lost.
    await db
      .update(enrollmentRequests)
      .set({ gatewayPaymentId: paymentRef, reference: paymentRef, method: 'online', updatedAt: new Date() })
      .where(eq(enrollmentRequests.id, fresh.id));

    if (!batchId) {
      // Paid, but nowhere to put them. Stays pending with the reason showing
      // in the admin queue, where a staff member places them by hand — that
      // path records the payment from the request's own fields.
      await db
        .update(enrollmentRequests)
        .set({ rejectionReason: 'Paid online — no batch open, place manually', updatedAt: new Date() })
        .where(eq(enrollmentRequests.id, fresh.id));
      logger.error({ orderId: ev.orderId }, 'paid but no batch to place into');
      return { status: 'pending' as const, needsManualPlacement: true };
    }

    let placed;
    try {
      // No staff role → enrolment is active immediately; also marks this
      // request verified and creates the admission.
      placed = await enrollStudent(batchId, fresh.studentId, undefined, {
        ...(fresh.feePlanId ? { feePlanId: fresh.feePlanId } : {}),
      });
    } catch (e) {
      const code = (e as { code?: string }).code;
      if (code === 'BATCH_FULL') {
        await db
          .update(enrollmentRequests)
          .set({ rejectionReason: 'Paid online — batch full, place manually', updatedAt: new Date() })
          .where(eq(enrollmentRequests.id, fresh.id));
        logger.error({ orderId: ev.orderId, batchId }, 'paid but batch full');
        return { status: 'pending' as const, needsManualPlacement: true };
      }
      throw e;
    }

    if (placed.admission) {
      await recordPayment(
        placed.admission.id,
        { amount: fresh.amount, method: 'online', reference: paymentRef },
        null,
        'gateway',
      );
    }

    const [course] = await db.select({ title: courses.title }).from(courses).where(eq(courses.id, fresh.courseId)).limit(1);
    await sendNotificationToUser(
      fresh.studentId,
      `Welcome to ${course?.title ?? 'your course'}!`,
      `Your payment went through and you are in ${placed.batchName}. Your classes are open — go and have a look.`,
      'admission_update',
      { courseId: fresh.courseId },
    );

    return { status: 'paid' as const, batchName: placed.batchName };
  } finally {
    await redis.del(lockKey);
  }
}

// ── Status: what the app polls ──────────────────────────────────────────────
export async function checkoutStatus(studentId: string, orderId: string) {
  const [row] = await db
    .select({ request: enrollmentRequests, batchName: batches.name })
    .from(enrollmentRequests)
    .leftJoin(batches, eq(batches.id, enrollmentRequests.intendedBatchId))
    .where(and(eq(enrollmentRequests.gatewayOrderId, orderId), eq(enrollmentRequests.studentId, studentId)))
    .limit(1);
  if (!row) throw err('Order not found', 404, 'NOT_FOUND');
  let r = row.request;

  // Webhook late? Ask the bank directly, and settle on its answer. The
  // sandbox has no such endpoint; the real bank will.
  if (r.status === 'pending' && !r.gatewayPaymentId) {
    const provider = orderId.split('_')[0] ?? '';
    const gw = gatewayByName(provider);
    if (gw?.fetchStatus) {
      try {
        const ev = await gw.fetchStatus(orderId);
        if (ev && ev.outcome !== 'pending') {
          await settleGatewayPayment(ev);
          const [again] = await db.select().from(enrollmentRequests).where(eq(enrollmentRequests.id, r.id)).limit(1);
          if (again) r = again;
        }
      } catch (e) {
        logger.warn({ err: e, orderId }, 'status nudge failed; leaving pending');
      }
    }
  }

  const status = r.status === 'verified' ? 'paid' : r.status === 'failed' ? 'failed' : 'pending';
  return {
    status,
    courseId: r.courseId,
    batchName: row.batchName,
    gatewayPaymentId: r.gatewayPaymentId,
    failureReason: r.status === 'failed' ? r.rejectionReason : null,
    // Paid but not yet placed: tell the student the truth, not "pending".
    awaitingPlacement: r.status === 'pending' && !!r.gatewayPaymentId,
  };
}
