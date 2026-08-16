import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { Form, useSearchParams } from "react-router";
import "./PricingModal.css";
import {
  estimatedMonthlyTotal,
  extraSeatMax,
  extrasTriggerNextPlan,
  formatUsd,
  getPlan,
  nextPlan,
  PAID_PLANS,
  type Plan,
} from "../../services/billing/plans";

export const PRICING_MODAL_ID = "stafftime-pricing-modal";

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
  initialStaffCount = 2,
  atCap = false,
  usageBillingActive = false,
  variant = "page",
}: {
  pricingPlansUrl: string;
  currentPlanHandle?: string;
  initialStaffCount?: number;
  atCap?: boolean;
  usageBillingActive?: boolean;
  variant?: "page" | "modal";
}) {
  const currentPlan = getPlan(currentPlanHandle);
  const recommendedPlan = nextPlan(currentPlan.handle);
  const extraMax = extraSeatMax(currentPlan);
  const currentExtraStaff = clampStaff(
    initialStaffCount - currentPlan.includedStaff,
    0,
    extraMax,
  );
  const [extraStaff, setExtraStaff] = useState(currentExtraStaff);
  const [estimateByPlan, setEstimateByPlan] = useState<Record<string, number>>({
    workforce: 10,
    enterprise: 100,
  });

  useEffect(() => {
    setExtraStaff(currentExtraStaff);
  }, [currentExtraStaff]);

  const extraPrice = extraStaff * currentPlan.extraStaffRate;
  const noExtras = extraStaff === 0;
  const offerNextPlan =
    Boolean(recommendedPlan) && extrasTriggerNextPlan(currentPlan, extraStaff);
  const sliderDisabled = usageBillingActive;

  return (
    <>
      <div className={`pricing-modal pricing-modal--${variant}`}>
        <s-paragraph tone="neutral" color="subdued">
          {atCap && recommendedPlan
            ? `${currentPlan.name} is at its ${currentPlan.maxStaff} staff max. Upgrade to ${recommendedPlan.name} (up to ${recommendedPlan.maxStaff}) to add more.`
            : atCap
              ? `${currentPlan.name} is at its ${currentPlan.maxStaff} staff max.`
              : `${currentPlan.name} includes ${currentPlan.includedStaff} staff and allows up to ${currentPlan.maxStaff}. Extra seats are ${formatUsd(currentPlan.extraStaffRate)} each.`}
        </s-paragraph>

        <div className="pricing-cards">
          {PAID_PLANS.map((plan) => {
            const estimateStaff =
              plan.handle === "small-business"
                ? plan.includedStaff
                : (estimateByPlan[plan.handle] ?? plan.includedStaff);
            const estimate = estimatedMonthlyTotal(plan, estimateStaff);
            const isCurrent = currentPlanHandle === plan.handle;
            const isNext = recommendedPlan?.handle === plan.handle;

            return (
              <article
                key={plan.handle}
                className={`pricing-card${plan.featured || isNext ? " featured" : ""}`}
              >
                {isNext ? (
                  <s-badge tone="success">Recommended next</s-badge>
                ) : plan.featured ? (
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
            <span>
              {usageBillingActive
                ? noExtras
                  ? `Usage billing is active. Add staff beyond ${currentPlan.includedStaff} included seats to bill ${formatUsd(currentPlan.extraStaffRate)} per extra seat / month.`
                  : `${extraStaff} extra seat${extraStaff === 1 ? "" : "s"} billed at ${formatUsd(currentPlan.extraStaffRate)}/mo each. Add staff to increase usage billing.`
                : offerNextPlan && recommendedPlan
                  ? `${formatUsd(extraPrice)}/mo in extras. Upgrade to ${recommendedPlan.name} (${formatUsd(recommendedPlan.monthlyPrice)}/mo, ${recommendedPlan.includedStaff} included).`
                  : noExtras
                    ? `No extra-seat charge within ${currentPlan.includedStaff} included seats.`
                    : `${formatUsd(currentPlan.extraStaffRate)} per extra staff / month`}
            </span>
          </div>
          <label className="pricing-slider">
            <input
              type="range"
              min={0}
              max={extraMax}
              value={extraStaff}
              disabled={sliderDisabled}
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
            max={extraMax}
            step={1}
            value={extraStaff}
            disabled={sliderDisabled}
            onChange={(event) =>
              setExtraStaff(clampStaff(Number(event.currentTarget.value), 0, extraMax))
            }
            aria-label="Extra staff count"
          />
          {usageBillingActive ? (
            offerNextPlan && recommendedPlan ? (
              <PlanCheckoutForm
                planHandle={recommendedPlan.handle}
                className="pricing-cta primary"
              >
                Upgrade to {recommendedPlan.name}
              </PlanCheckoutForm>
            ) : atCap ? (
              <s-button variant="secondary" disabled>
                Staff limit reached
              </s-button>
            ) : (
              <s-button variant="primary" href="/app/staff/new">
                Add staff
              </s-button>
            )
          ) : noExtras ? (
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
          ) : offerNextPlan && recommendedPlan ? (
            <PlanCheckoutForm
              planHandle={recommendedPlan.handle}
              className="pricing-cta primary"
            >
              Upgrade to {recommendedPlan.name}
            </PlanCheckoutForm>
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
  initialStaffCount = 2,
  atCap = false,
  usageBillingActive = false,
}: {
  pricingPlansUrl: string;
  currentPlanHandle?: string;
  initialStaffCount?: number;
  atCap?: boolean;
  usageBillingActive?: boolean;
}) {
  return (
    <s-modal id={PRICING_MODAL_ID} heading="Choose a plan" size="large">
      <PricingPlans
        pricingPlansUrl={pricingPlansUrl}
        currentPlanHandle={currentPlanHandle}
        initialStaffCount={initialStaffCount}
        atCap={atCap}
        usageBillingActive={usageBillingActive}
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
