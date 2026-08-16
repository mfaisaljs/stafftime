import type { ReactNode } from "react";
import { useState } from "react";
import { Form, useSearchParams } from "react-router";
import "./PricingModal.css";
import {
  estimatedMonthlyTotal,
  formatUsd,
  effectiveMaxStaff,
  getPlan,
  PAID_PLANS,
  type Plan,
} from "../../services/billing/plans";

export const PRICING_MODAL_ID = "stafftime-pricing-modal";
const EXTRA_SEAT_SLIDER_MAX = 50;

function PlanCheckoutForm({
  planHandle,
  className,
  disabled,
  children,
}: {
  planHandle: string;
  className?: string;
  disabled?: boolean;
  children: ReactNode;
}) {
  const [searchParams] = useSearchParams();
  const actionParams = new URLSearchParams(searchParams);
  actionParams.delete("subscribe_error");

  return (
    <Form
      method="post"
      className="pricing-checkout-form"
      action={`/app/pricing${actionParams.toString() ? `?${actionParams.toString()}` : ""}`}
    >
      <input type="hidden" name="plan" value={planHandle} />
      <button type="submit" className={className} disabled={disabled}>
        {children}
      </button>
    </Form>
  );
}

export function openPricingModal() {
  const modal = document.getElementById(PRICING_MODAL_ID) as
    | (HTMLElement & { showOverlay?: () => void })
    | null;
  modal?.showOverlay?.();
}

export function closePricingModal() {
  const modal = document.getElementById(PRICING_MODAL_ID) as
    | (HTMLElement & { hideOverlay?: () => void })
    | null;
  modal?.hideOverlay?.();
}

export function PricingPlans({
  pricingPlansUrl,
  currentPlanHandle = "free",
  initialStaffCount = 1,
  currentExtraStaffCount = 0,
  atCap = false,
  variant = "page",
}: {
  pricingPlansUrl: string;
  currentPlanHandle?: string;
  initialStaffCount?: number;
  currentExtraStaffCount?: number;
  atCap?: boolean;
  variant?: "page" | "modal";
}) {
  const currentPlan = getPlan(currentPlanHandle);
  const planStaffCap = effectiveMaxStaff(currentPlan);
  const [extraStaff, setExtraStaff] = useState(() =>
    clampStaff(initialStaffCount - currentPlan.includedStaff, 0, EXTRA_SEAT_SLIDER_MAX),
  );
  const [estimateByPlan, setEstimateByPlan] = useState<Record<string, number>>({
    workforce: 10,
    enterprise: 100,
  });

  const extraPrice = extraStaff * currentPlan.extraStaffRate;
  const currentExtraPrice = currentExtraStaffCount * currentPlan.extraStaffRate;
  const noExtras = extraStaff === 0;

  return (
    <>
      <div className={`pricing-modal pricing-modal--${variant}`}>
        <s-paragraph tone="neutral" color="subdued">
          {atCap
            ? `${currentPlan.name} is at its ${planStaffCap} staff max.`
            : `${currentPlan.name} includes ${currentPlan.includedStaff} staff and allows up to ${planStaffCap}. Extra seats are ${formatUsd(currentPlan.extraStaffRate)} each.`}
        </s-paragraph>

        <div className="pricing-cards">
          {PAID_PLANS.map((plan) => {
            const estimateStaff =
              plan.handle === "small-business"
                ? plan.includedStaff
                : (estimateByPlan[plan.handle] ?? plan.includedStaff);
            const estimate = estimatedMonthlyTotal(plan, estimateStaff);
            const isCurrent = currentPlanHandle === plan.handle;

            return (
              <article
                key={plan.handle}
                className={`pricing-card${plan.featured ? " featured" : ""}`}
              >
                {plan.featured ? (
                  <s-badge tone="success">Most popular</s-badge>
                ) : null}
                <h3>{plan.name}</h3>
                <p className="pricing-price">
                  <strong>
                    {formatUsd(
                      plan.handle === "workforce" || plan.handle === "enterprise"
                        ? estimate
                        : plan.monthlyPrice,
                    )}
                  </strong>
                  <span>/PER MONTH</span>
                </p>
                <p className="pricing-included">
                  {plan.includedStaff} staff included · {formatUsd(plan.extraStaffRate)}{" "}
                  extra / staff
                </p>
                {plan.handle === "workforce" || plan.handle === "enterprise" ? (
                  <div className="pricing-estimate">
                    <span className="pricing-upto">
                      Up to
                      <select
                        aria-label={`${plan.name} staff members`}
                        value={String(estimateStaff)}
                        onChange={(event) => {
                          const value = Number(event.currentTarget.value);
                          if (!Number.isFinite(value)) return;
                          setEstimateByPlan((previous) => ({
                            ...previous,
                            [plan.handle]: value,
                          }));
                        }}
                      >
                        {staffOptionsForPlan(plan.handle).map((count) => (
                          <option key={count} value={count}>
                            {count}
                          </option>
                        ))}
                      </select>
                      staff member
                    </span>
                  </div>
                ) : (
                  <p className="pricing-estimate-copy">
                    {plan.description}
                  </p>
                )}
                <ul>
                  {plan.features.map((feature) => (
                    <li key={feature}>{feature}</li>
                  ))}
                </ul>
                <PlanCheckoutForm
                  planHandle={plan.handle}
                  className={`pricing-cta${plan.featured ? " primary" : ""}`}
                  disabled={isCurrent}
                >
                  {ctaLabel(plan, isCurrent)}
                </PlanCheckoutForm>
              </article>
            );
          })}
        </div>

        <div className="pricing-free-bar">
          <s-badge tone="warning">{currentPlan.name} plan</s-badge>
          <div className="pricing-free-copy">
            <strong>Up to {currentPlan.includedStaff} Staff Members included</strong>
            <span className="pricing-extra-usage">
              {currentExtraStaffCount > 0
                ? `${currentExtraStaffCount} extra seat${currentExtraStaffCount === 1 ? "" : "s"} in use (${formatUsd(currentExtraPrice)}/mo)`
                : "No extra seats in use"}
            </span>
            <span>
              {noExtras
                ? `No extra-seat charge within ${currentPlan.includedStaff} included seats.`
                : `${formatUsd(currentPlan.extraStaffRate)} per extra staff / month`}
            </span>
          </div>
          <label className="pricing-slider">
            <input
              type="range"
              min={0}
              max={EXTRA_SEAT_SLIDER_MAX}
              value={extraStaff}
              onChange={(event) =>
                setExtraStaff(Number(event.currentTarget.value))
              }
              aria-label="Extra staff beyond included seats"
            />
          </label>
          <input
            className="pricing-extra-count"
            type="number"
            min={0}
            max={EXTRA_SEAT_SLIDER_MAX}
            step={1}
            value={extraStaff}
            onChange={(event) =>
              setExtraStaff(
                clampStaff(Number(event.currentTarget.value), 0, EXTRA_SEAT_SLIDER_MAX),
              )
            }
            aria-label="Extra staff count"
          />
          {noExtras ? (
            variant === "modal" ? (
              <s-button
                variant="secondary"
                commandFor={PRICING_MODAL_ID}
                command="--hide"
              >
                Continue with {currentPlan.name}
              </s-button>
            ) : (
              <s-button variant="secondary" href="/app/staff">
                Continue with {currentPlan.name}
              </s-button>
            )
          ) : (
            <PlanCheckoutForm
              planHandle={currentPlan.handle}
              className="pricing-cta primary"
            >
              Subscribe for {formatUsd(extraPrice)}
            </PlanCheckoutForm>
          )}
        </div>
      </div>
    </>
  );
}

export function PricingModal({
  pricingPlansUrl,
  currentPlanHandle = "free",
  initialStaffCount = 1,
  currentExtraStaffCount = 0,
  atCap = false,
}: {
  pricingPlansUrl: string;
  currentPlanHandle?: string;
  initialStaffCount?: number;
  currentExtraStaffCount?: number;
  atCap?: boolean;
}) {
  return (
    <s-modal id={PRICING_MODAL_ID} heading="Choose a plan" size="large">
      <PricingPlans
        pricingPlansUrl={pricingPlansUrl}
        currentPlanHandle={currentPlanHandle}
        initialStaffCount={initialStaffCount}
        currentExtraStaffCount={currentExtraStaffCount}
        atCap={atCap}
        variant="modal"
      />
    </s-modal>
  );
}

function ctaLabel(plan: Plan, isCurrent: boolean) {
  if (isCurrent) return "Current plan";
  if (plan.trialDays > 0) return `Start ${plan.trialDays}-day trial`;
  return "Subscribe";
}

function clampStaff(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Math.round(value)));
}

const WORKFORCE_STAFF_OPTIONS = rangeInclusive(10, 100);
const ENTERPRISE_STAFF_OPTIONS = rangeInclusive(100, 500);

function rangeInclusive(from: number, to: number) {
  return Array.from({ length: to - from + 1 }, (_, index) => from + index);
}

function staffOptionsForPlan(handle: "workforce" | "enterprise") {
  return handle === "workforce" ? WORKFORCE_STAFF_OPTIONS : ENTERPRISE_STAFF_OPTIONS;
}
