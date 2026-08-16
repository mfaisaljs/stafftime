import { useState } from "react";
import {
  estimatedMonthlyTotal,
  extraSeatMax,
  formatUsd,
  getPlan,
  nextPlan,
  PAID_PLANS,
  type Plan,
} from "../../services/billing/plans";

export const PRICING_MODAL_ID = "stafftime-pricing-modal";

function openShopifyPricing(url: string) {
  open(url, "_top");
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
  variant = "page",
}: {
  pricingPlansUrl: string;
  currentPlanHandle?: string;
  initialStaffCount?: number;
  atCap?: boolean;
  variant?: "page" | "modal";
}) {
  const currentPlan = getPlan(currentPlanHandle);
  const recommendedPlan = nextPlan(currentPlan.handle);
  const extraMax = extraSeatMax(currentPlan);
  const [extraStaff, setExtraStaff] = useState(() =>
    clampStaff(initialStaffCount - currentPlan.includedStaff, 0, extraMax),
  );
  const [estimateByPlan, setEstimateByPlan] = useState<Record<string, number>>({
    workforce: 10,
    enterprise: 100,
  });

  const extraPrice = extraStaff * currentPlan.extraStaffRate;
  const noExtras = extraStaff === 0;

  return (
    <>
      <div className="pricing-modal">
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
                <button
                  type="button"
                  className={`pricing-cta${plan.featured ? " primary" : ""}`}
                  onClick={() => openShopifyPricing(pricingPlansUrl)}
                >
                  {ctaLabel(plan, isCurrent)}
                </button>
              </article>
            );
          })}
        </div>

        <div className="pricing-free-bar">
          <s-badge tone="warning">{currentPlan.name} plan</s-badge>
          <div className="pricing-free-copy">
            <strong>Up to {currentPlan.includedStaff} Staff Members included</strong>
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
              max={extraMax}
              value={extraStaff}
              onChange={(event) =>
                setExtraStaff(Number(event.currentTarget.value))
              }
              aria-label="Extra staff beyond included seats"
            />
            <input
              type="number"
              min={0}
              max={extraMax}
              step={1}
              value={extraStaff}
              onChange={(event) =>
                setExtraStaff(clampStaff(Number(event.currentTarget.value), 0, extraMax))
              }
              aria-label="Extra staff count"
            />
          </label>
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
            <button
              type="button"
              className="pricing-cta primary"
              onClick={() => openShopifyPricing(pricingPlansUrl)}
            >
              Subscribe for {formatUsd(extraPrice)}
            </button>
          )}
        </div>
      </div>
      <style>{PRICING_MODAL_STYLES}</style>
    </>
  );
}

export function PricingModal({
  pricingPlansUrl,
  currentPlanHandle = "free",
  initialStaffCount = 2,
  atCap = false,
}: {
  pricingPlansUrl: string;
  currentPlanHandle?: string;
  initialStaffCount?: number;
  atCap?: boolean;
}) {
  return (
    <s-modal id={PRICING_MODAL_ID} heading="Choose a plan" size="large">
      <PricingPlans
        pricingPlansUrl={pricingPlansUrl}
        currentPlanHandle={currentPlanHandle}
        initialStaffCount={initialStaffCount}
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

const PRICING_MODAL_STYLES = `
  .pricing-modal {
    display: grid;
    gap: 20px;
  }

  .pricing-cards {
    display: grid;
    gap: 16px;
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .pricing-card {
    background: #fff;
    border: 1px solid #e3e3e3;
    border-radius: 16px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    min-height: 100%;
    padding: 20px;
  }

  .pricing-card.featured {
    background: #edfaf3;
    border-color: #8fd3b0;
    box-shadow: 0 8px 24px rgba(16, 128, 80, 0.12);
  }

  .pricing-card h3 {
    font-size: 18px;
    margin: 0;
  }

  .pricing-price {
    align-items: baseline;
    display: flex;
    gap: 6px;
    margin: 0;
  }

  .pricing-price strong {
    font-size: 28px;
  }

  .pricing-price span,
  .pricing-included,
  .pricing-estimate-copy,
  .pricing-estimate small,
  .pricing-free-copy span {
    color: #616161;
    font-size: 13px;
  }

  .pricing-included,
  .pricing-estimate-copy {
    margin: 0;
  }

  .pricing-estimate {
    display: grid;
    gap: 6px;
    font-size: 13px;
  }

  .pricing-upto {
    align-items: center;
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .pricing-upto select {
    background: #fff;
    border: 1px solid #8a8a8a;
    border-radius: 8px;
    min-height: 32px;
    min-width: 88px;
    padding: 4px 8px;
  }

  .pricing-card ul {
    display: grid;
    align-content: start;
    gap: 6px;
    margin: 0;
    padding-left: 18px;
  }

  .pricing-card li {
    color: #303030;
    font-size: 13px;
  }

  .pricing-cta,
  .pricing-free-bar .pricing-cta {
    align-items: center;
    background: #1f1f1f;
    border: 0;
    border-radius: 10px;
    box-sizing: border-box;
    color: #fff;
    cursor: pointer;
    display: flex;
    flex-shrink: 0;
    font: inherit;
    font-weight: 600;
    justify-content: center;
    margin-top: auto;
    min-height: 40px;
    padding: 10px 14px;
    text-decoration: none;
    width: 100%;
  }

  .pricing-cta.primary {
    background: #008060;
  }

  .pricing-free-bar {
    align-items: center;
    background: #fff8f1;
    border: 1px solid #f3d2b3;
    border-radius: 14px;
    display: grid;
    gap: 12px;
    grid-template-columns: auto 1fr minmax(180px, 1.2fr) auto;
    padding: 16px;
  }

  .pricing-free-copy {
    display: grid;
    gap: 2px;
  }

  .pricing-slider {
    align-items: center;
    display: grid;
    gap: 10px;
    grid-template-columns: 1fr 88px;
  }

  .pricing-slider input[type="range"] {
    accent-color: #e67e22;
    width: 100%;
  }

  .pricing-slider input[type="number"] {
    background: #fff;
    border: 1px solid #8a8a8a;
    border-radius: 8px;
    min-height: 32px;
    padding: 4px 8px;
    width: 88px;
  }

  @media (max-width: 900px) {
    .pricing-cards,
    .pricing-free-bar {
      grid-template-columns: 1fr;
    }
  }
`;
