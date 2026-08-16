import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import type { ForwardedRef, InputHTMLAttributes, ReactNode } from "react";
import { forwardRef, useRef, useState } from "react";
import { Form, useActionData, useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import {
  getAdminShop,
  getEmployeeLocations,
} from "../services/admin.server";
import { createEmployee } from "../services/workforce.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const locations = await getEmployeeLocations(session);
  return { locations };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = await getAdminShop(session);
  const formData = await request.formData();

  try {
    const position = String(formData.get("position") ?? "Staff");
    const locationAccess = String(formData.get("locationAccess") ?? "ALL");
    const weeklyAvailability = formData.getAll("weeklyAvailability").join(",");

    await createEmployee({
      shopId: shop.id,
      locationId:
        locationAccess === "SPECIFIC"
          ? String(formData.get("locationId") ?? "") || undefined
          : undefined,
      firstName: String(formData.get("firstName") ?? ""),
      lastName: String(formData.get("lastName") ?? ""),
      email: String(formData.get("email") ?? "") || undefined,
      phone: String(formData.get("phone") ?? "") || undefined,
      pin: String(formData.get("pin") ?? "0000"),
      role: roleFromPosition(position),
      position,
      locationAccess,
      hourlyRate: Number(formData.get("hourlyRate") ?? 0),
      currency: String(formData.get("currency") ?? "USD"),
      payrollType: String(formData.get("payrollType") ?? "HOURLY"),
      salaryAmount: Number(formData.get("salaryAmount") ?? 0),
      weeklyAvailability,
      paymentMethod: String(formData.get("paymentMethod") ?? "PAYPAL"),
      paypalEmail: String(formData.get("paypalEmail") ?? "") || undefined,
      paypalAccountName:
        String(formData.get("paypalAccountName") ?? "") || undefined,
      bankAccountType:
        String(formData.get("bankAccountType") ?? "") || undefined,
      bankName: String(formData.get("bankName") ?? "") || undefined,
      accountHolderName:
        String(formData.get("accountHolderName") ?? "") || undefined,
      accountNumber: String(formData.get("accountNumber") ?? "") || undefined,
      routingNumber:
        String(formData.get("bankAccountType") ?? "") === "INTERNATIONAL"
          ? undefined
          : String(formData.get("routingNumber") ?? "") || undefined,
      swiftBic:
        String(formData.get("bankAccountType") ?? "") === "INTERNATIONAL"
          ? String(formData.get("swiftBic") ?? "") || undefined
          : undefined,
      iban:
        String(formData.get("bankAccountType") ?? "") === "INTERNATIONAL"
          ? String(formData.get("iban") ?? "") || undefined
          : undefined,
    });
  } catch (error) {
    return {
      error:
        error instanceof Error ? error.message : "Could not add employee",
    };
  }

  return { success: "Staff member added" };
};

export default function StaffPage() {
  const { locations } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const [pin, setPin] = useState("");
  const [payrollType, setPayrollType] = useState("HOURLY");
  const [paymentMethod, setPaymentMethod] = useState("PAYPAL");
  const [bankAccountType, setBankAccountType] = useState("DOMESTIC");
  const pinInputRef = useRef<HTMLInputElement>(null);
  const rateFieldName = payrollType === "HOURLY" ? "hourlyRate" : "salaryAmount";
  const rateFieldLabel =
    payrollType === "HOURLY"
      ? "Hourly Rate"
      : payrollType === "WEEKLY"
        ? "Weekly Pay"
        : "Monthly Salary";
  const selectedPaymentLabel = paymentMethodLabel(paymentMethod);
  const showPayPalFields = paymentMethod === "PAYPAL";
  const showStripeFields = paymentMethod === "STRIPE";
  const showWiseFields = paymentMethod === "WISE";
  const showPayoneerFields = paymentMethod === "PAYONEER";
  const showRevolutFields = paymentMethod === "REVOLUT";
  const showVenmoFields = paymentMethod === "VENMO";
  const showSquareFields = paymentMethod === "SQUARE";
  const showBankFields = BANK_PAYMENT_METHODS.includes(paymentMethod);
  const showNoPaymentFields = NO_DETAIL_PAYMENT_METHODS.includes(paymentMethod);

  const generatePin = () => {
    const newPin = String(Math.floor(1000 + Math.random() * 9000));
    setPin(newPin);
    if (pinInputRef.current) {
      pinInputRef.current.value = newPin;
      notifySaveBar(pinInputRef.current);
    }
  };

  const handleDiscard = () => {
    setPin("");
    setPayrollType("HOURLY");
    setPaymentMethod("PAYPAL");
    setBankAccountType("DOMESTIC");
  };

  return (
    <s-page heading="Add Shopify Staff" inlineSize="large">
      {actionData?.error && (
        <s-banner heading={actionData.error} tone="critical" />
      )}
      {actionData?.success && (
        <s-banner heading={actionData.success} tone="success" />
      )}
      <Form
        method="post"
        data-save-bar
        data-discard-confirmation
        onReset={handleDiscard}
      >
        <s-section heading="Add Shopify Staff">
          <s-stack direction="block" gap="large">
            <FormSection
              title="Basic Information"
              description="Manage contact information and permissions."
            >
              <div className="staff-grid two">
                <Field label="First Name" name="firstName" required />
                <Field label="Last Name" name="lastName" required />
                <Field label="Email" name="email" type="email" />
                <Field label="Phone (optional)" name="phone" type="tel" />
              </div>
            </FormSection>

            <FormSection title="Position" description="Permissions.">
              <label className="staff-label">
                Position
                <select name="position" defaultValue="Staff">
                  {POSITION_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
            </FormSection>

            <FormSection title="PIN Code" description="PIN Code.">
              <p className="staff-help">
                Staff need a unique 4 digit PIN to access the StaffTime POS app.
              </p>
              <div className="staff-inline">
                <Field
                  ref={pinInputRef}
                  label="PIN Code"
                  name="pin"
                  minLength={4}
                  required
                  value={pin}
                  onChange={(event) => {
                    setPin(event.currentTarget.value);
                    notifySaveBar(event.currentTarget);
                  }}
                />
                <button type="button" className="secondary" onClick={generatePin}>
                  Generate Random
                </button>
              </div>
            </FormSection>

            <FormSection title="Location" description="Location Access.">
              <label className="staff-radio">
                <input
                  type="radio"
                  name="locationAccess"
                  value="ALL"
                  defaultChecked
                />
                All Locations
              </label>
              <label className="staff-radio">
                <input type="radio" name="locationAccess" value="SPECIFIC" />
                Specific Locations
              </label>
              <label className="staff-label">
                Specific location
                <select name="locationId" defaultValue="">
                  <option value="">Select location</option>
                  {locations.map((location) => (
                    <option key={location.id} value={location.id}>
                      {location.name}
                    </option>
                  ))}
                </select>
              </label>
            </FormSection>

            <FormSection
              title="Payroll Information"
              description="Configure payment methods and salary details."
            >
              <div className="staff-grid three">
                {paymentMethod !== "WISE" ? (
                  <label className="staff-label">
                    Currency
                    <select name="currency" defaultValue="USD">
                      {CURRENCY_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
                <label className="staff-label">
                  Payroll Type
                  <select
                    name="payrollType"
                    value={payrollType}
                    onChange={(event) => {
                      setPayrollType(event.currentTarget.value);
                      notifySaveBar(event.currentTarget);
                    }}
                  >
                    {PAYROLL_TYPE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <Field
                  key={rateFieldName}
                  label={rateFieldLabel}
                  name={rateFieldName}
                  type="number"
                  step="0.01"
                  defaultValue="0"
                />
              </div>
            </FormSection>

            <FormSection
              title="Weekly Availability"
              description="Set the days this staff member is available to work. Managers will see a warning if they schedule outside these days."
            >
              <div className="day-picker">
                {WEEKDAYS.map((day) => (
                  <label key={day.value} className="day-pill">
                    <input
                      type="checkbox"
                      name="weeklyAvailability"
                      value={day.value}
                      defaultChecked={day.value !== "SUNDAY"}
                    />
                    <span>{day.label}</span>
                  </label>
                ))}
              </div>
              <p className="staff-help">
                Click a day to toggle availability. Green = available.
              </p>
            </FormSection>

            <FormSection
              title="Payment Method"
              description="Choose the preferred payment method for international or local payments."
            >
              <label className="staff-label">
                Payment Method
                <select
                  name="paymentMethod"
                  value={paymentMethod}
                  onChange={(event) => {
                    setPaymentMethod(event.currentTarget.value);
                    notifySaveBar(event.currentTarget);
                  }}
                >
                  {PAYMENT_METHOD_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              {showPayPalFields && (
                <div className="staff-grid two">
                  <Field
                    label="PayPal Email"
                    name="paypalEmail"
                    type="email"
                    placeholder="Enter PayPal email address"
                  />
                  <Field
                    label="PayPal Account Name"
                    name="paypalAccountName"
                    placeholder="Account holder name in PayPal"
                  />
                </div>
              )}
              {showStripeFields && (
                <div className="staff-grid one">
                  <Field
                    label="Stripe Account Email"
                    name="paypalEmail"
                    type="email"
                    placeholder="Stripe account email address"
                  />
                  <label className="staff-label">
                    Stripe Account ID
                    <input
                      name="paypalAccountName"
                      placeholder="acct_xxxxxxxxxxxxxx"
                    />
                    <span className="staff-help">
                      Stripe Connect account ID (if applicable)
                    </span>
                  </label>
                </div>
              )}
              {showWiseFields && (
                <div className="staff-grid one">
                  <Field
                    label="Wise Email"
                    name="paypalEmail"
                    type="email"
                    placeholder="Wise account email"
                  />
                  <Field
                    label="Wise Account Holder Name"
                    name="paypalAccountName"
                    placeholder="Name on Wise account"
                  />
                  <label className="staff-label">
                    Wise Account Currency
                    <select name="currency" defaultValue="USD">
                      {CURRENCY_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              )}
              {showPayoneerFields && (
                <div className="staff-grid one">
                  <Field
                    label="Payoneer Email"
                    name="paypalEmail"
                    type="email"
                    placeholder="Payoneer account email"
                  />
                  <Field
                    label="Payoneer Account Name"
                    name="paypalAccountName"
                    placeholder="Name on Payoneer account"
                  />
                </div>
              )}
              {showRevolutFields && (
                <div className="staff-grid one">
                  <Field
                    label="Revolut Email/Phone"
                    name="paypalEmail"
                    placeholder="Email or phone linked to Revolut"
                  />
                  <Field
                    label="Revolut Username"
                    name="paypalAccountName"
                    placeholder="@username (if applicable)"
                  />
                </div>
              )}
              {showVenmoFields && (
                <div className="staff-grid one">
                  <Field
                    label="Venmo Username"
                    name="paypalAccountName"
                    placeholder="@username"
                  />
                  <Field
                    label="Venmo Phone Number"
                    name="paypalEmail"
                    placeholder="Phone number linked to Venmo"
                  />
                </div>
              )}
              {showSquareFields && (
                <div className="staff-grid one">
                  <Field
                    label="Cash App $Cashtag"
                    name="paypalAccountName"
                    placeholder="$cashtag"
                  />
                  <Field
                    label="Cash App Phone/Email"
                    name="paypalEmail"
                    placeholder="Phone or email linked to Cash App"
                  />
                </div>
              )}
              {showBankFields && (
                <div className="staff-grid one">
                  <label className="staff-label">
                    Bank Account Type
                    <select
                      name="bankAccountType"
                      value={bankAccountType}
                      onChange={(event) =>
                        setBankAccountType(event.currentTarget.value)
                      }
                    >
                      <option value="DOMESTIC">Domestic</option>
                      <option value="INTERNATIONAL">
                        International (SWIFT)
                      </option>
                    </select>
                  </label>
                  <Field
                    label="Bank Name"
                    name="bankName"
                    placeholder="Enter bank name"
                  />
                  <Field
                    label="Account Holder Name"
                    name="accountHolderName"
                    placeholder="Enter account holder name"
                  />
                  <Field
                    label="Account Number"
                    name="accountNumber"
                    placeholder="Enter account number"
                  />
                  {bankAccountType === "INTERNATIONAL" ? (
                    <>
                      <Field
                        label="SWIFT/BIC Code"
                        name="swiftBic"
                        placeholder="Enter SWIFT/BIC code"
                      />
                      <Field
                        label="IBAN"
                        name="iban"
                        placeholder="Enter IBAN"
                      />
                    </>
                  ) : (
                    <Field
                      label="Routing Number"
                      name="routingNumber"
                      placeholder="Enter routing number"
                    />
                  )}
                </div>
              )}
              {showNoPaymentFields && (
                <p className="staff-help">
                  No extra account details are required for {selectedPaymentLabel}.
                </p>
              )}
            </FormSection>

          </s-stack>
        </s-section>
      </Form>

      <style>{EMPLOYEE_FORM_STYLES}</style>
    </s-page>
  );
}

function notifySaveBar(element: HTMLInputElement | HTMLSelectElement) {
  element.dispatchEvent(new Event("input", { bubbles: true }));
}

const Field = forwardRef(function Field(
  { label, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: string },
  ref: ForwardedRef<HTMLInputElement>,
) {
  return (
    <label className="staff-label">
      {label}
      <input ref={ref} placeholder={label} {...props} />
    </label>
  );
});

function FormSection({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div className="form-section">
      <div className="form-section-copy">
        <strong>{title}</strong>
        <span>{description}</span>
      </div>
      <div className="form-section-card">{children}</div>
    </div>
  );
}

function roleFromPosition(position: string) {
  switch (position) {
    case "Owner":
      return "OWNER" as const;
    case "Manager":
      return "STORE_MANAGER" as const;
    default:
      return "EMPLOYEE" as const;
  }
}

const POSITION_OPTIONS = ["Owner", "Staff", "Manager"];

const CURRENCY_OPTIONS = [
  { value: "USD", label: "US Dollar (USD)" },
  { value: "JPY", label: "Japanese Yen (JPY)" },
  { value: "AUD", label: "Australian Dollar (AUD)" },
  { value: "CAD", label: "Canadian Dollar (CAD)" },
  { value: "SAR", label: "Saudi Riyal (SAR)" },
  { value: "CNY", label: "Chinese Yuan (CNY)" },
  { value: "IDR", label: "Indonesian Rupiah (IDR)" },
  { value: "SGD", label: "Singapore Dollar (SGD)" },
  { value: "TWD", label: "New Taiwan Dollar (TWD)" },
  { value: "HKD", label: "Hong Kong Dollar (HKD)" },
  { value: "SEK", label: "Swedish Krona (SEK)" },
  { value: "ZAR", label: "South African Rand (ZAR)" },
  { value: "BRL", label: "Brazilian Real (BRL)" },
  { value: "RUB", label: "Russian Ruble (RUB)" },
  { value: "MXN", label: "Mexican Peso (MXN)" },
  { value: "AED", label: "United Arab Emirates Dirham (AED)" },
];

const PAYROLL_TYPE_OPTIONS = [
  { value: "HOURLY", label: "Hourly" },
  { value: "WEEKLY", label: "Weekly" },
  { value: "MONTHLY", label: "Monthly" },
];

const PAYMENT_METHOD_OPTIONS = [
  { value: "PAYPAL", label: "PayPal" },
  { value: "STRIPE", label: "Stripe" },
  { value: "WISE", label: "Wise" },
  { value: "PAYONEER", label: "Payoneer" },
  { value: "BANK_TRANSFER", label: "Bank Transfer" },
  { value: "DIRECT_DEPOSIT", label: "Direct Deposit" },
  { value: "CASH", label: "Cash" },
  { value: "CHECK", label: "Check" },
  { value: "REVOLUT", label: "Revolut" },
  { value: "VENMO", label: "Venmo" },
  { value: "SQUARE", label: "Square" },
];

const BANK_PAYMENT_METHODS = [
  "BANK_TRANSFER",
  "DIRECT_DEPOSIT",
];

const NO_DETAIL_PAYMENT_METHODS = ["CASH", "CHECK"];

function paymentMethodLabel(value: string) {
  return (
    PAYMENT_METHOD_OPTIONS.find((option) => option.value === value)?.label ??
    "Payment"
  );
}

const WEEKDAYS = [
  { value: "MONDAY", label: "Monday" },
  { value: "TUESDAY", label: "Tuesday" },
  { value: "WEDNESDAY", label: "Wednesday" },
  { value: "THURSDAY", label: "Thursday" },
  { value: "FRIDAY", label: "Friday" },
  { value: "SATURDAY", label: "Saturday" },
  { value: "SUNDAY", label: "Sunday" },
];

const EMPLOYEE_FORM_STYLES = `
  .form-section {
    display: grid;
    grid-template-columns: minmax(160px, 280px) 1fr;
    gap: 24px;
    align-items: start;
    min-width: 0;
  }

  .form-section-copy {
    display: grid;
    gap: 6px;
    color: #303030;
  }

  .form-section-copy span,
  .staff-help {
    color: #616161;
    font-size: 12px;
    margin: 0;
  }

  .form-section-card {
    background: #fff;
    border: 1px solid #e3e3e3;
    border-radius: 12px;
    display: grid;
    gap: 12px;
    min-width: 0;
    padding: 16px;
  }

  .staff-grid {
    display: grid;
    gap: 12px;
    min-width: 0;
  }

  .staff-grid.two {
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  }

  .staff-grid.one {
    grid-template-columns: 1fr;
  }

  .staff-grid.three {
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  }

  .staff-label {
    color: #303030;
    display: grid;
    font-size: 12px;
    gap: 4px;
    min-width: 0;
  }

  .staff-label input,
  .staff-label select {
    box-sizing: border-box;
    border: 1px solid #8a8a8a;
    border-radius: 6px;
    min-height: 32px;
    padding: 4px 8px;
    width: 100%;
  }

  .staff-inline {
    align-items: end;
    display: grid;
    gap: 12px;
    grid-template-columns: minmax(160px, 220px) auto;
    justify-content: start;
  }

  .staff-inline .staff-label {
    min-width: 0;
  }

  button.secondary {
    background: #fff;
    border: 1px solid #c9cccf;
    border-radius: 6px;
    cursor: pointer;
    min-height: 32px;
    padding: 4px 12px;
    white-space: nowrap;
  }

  .staff-radio {
    align-items: center;
    display: flex;
    gap: 8px;
    font-size: 13px;
  }

  .day-picker {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .day-pill input {
    display: none;
  }

  .day-pill span {
    border: 1px solid #c9cccf;
    border-radius: 999px;
    cursor: pointer;
    display: inline-block;
    padding: 6px 12px;
  }

  .day-pill input:checked + span {
    background: #008060;
    border-color: #008060;
    color: #fff;
  }

  @media (max-width: 768px) {
    .form-section,
    .staff-grid.two,
    .staff-grid.three,
    .staff-inline {
      grid-template-columns: 1fr;
    }
  }
`;

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
