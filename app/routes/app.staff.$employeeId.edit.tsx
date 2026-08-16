import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import type { InputHTMLAttributes, ReactNode } from "react";
import { useState } from "react";
import { useFetcher, useLoaderData } from "react-router";
import { AppPage } from "../components/AppPage";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import {
  getAdminShop,
  getEmployeeById,
  getEmployeeLocations,
} from "../services/admin.server";
import { updateEmployee } from "../services/workforce.server";
import { useSaveBarToast } from "../hooks/useSaveBarToast";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const employeeId = params.employeeId;
  if (!employeeId) throw new Response("Staff member not found", { status: 404 });

  const [employee, locations] = await Promise.all([
    getEmployeeById(session, employeeId),
    getEmployeeLocations(session),
  ]);

  if (!employee) throw new Response("Staff member not found", { status: 404 });
  return { employee, locations };
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const employeeId = params.employeeId;
  if (!employeeId) throw new Response("Staff member not found", { status: 404 });

  const shop = await getAdminShop(session);
  const formData = await request.formData();

  try {
    const position = String(formData.get("position") ?? "Staff");
    const locationAccess = String(formData.get("locationAccess") ?? "ALL");
    const pin = String(formData.get("pin") ?? "").trim();

    await updateEmployee({
      shopId: shop.id,
      employeeId,
      locationId:
        locationAccess === "SPECIFIC"
          ? String(formData.get("locationId") ?? "") || null
          : null,
      firstName: String(formData.get("firstName") ?? ""),
      lastName: String(formData.get("lastName") ?? ""),
      email: String(formData.get("email") ?? "") || undefined,
      phone: String(formData.get("phone") ?? "") || undefined,
      pin: pin || undefined,
      role: roleFromPosition(position),
      position,
      locationAccess,
      hourlyRate: Number(formData.get("hourlyRate") ?? 0),
      currency: String(formData.get("currency") ?? "USD"),
      payrollType: String(formData.get("payrollType") ?? "HOURLY"),
      salaryAmount: Number(formData.get("salaryAmount") ?? 0),
      weeklyAvailability: formData.getAll("weeklyAvailability").join(","),
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
          ? null
          : String(formData.get("routingNumber") ?? "") || null,
      swiftBic:
        String(formData.get("bankAccountType") ?? "") === "INTERNATIONAL"
          ? String(formData.get("swiftBic") ?? "") || null
          : null,
      iban:
        String(formData.get("bankAccountType") ?? "") === "INTERNATIONAL"
          ? String(formData.get("iban") ?? "") || null
          : null,
    });
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Could not update staff",
    };
  }

  return { success: "Staff member updated" };
};

export default function EditStaffPage() {
  const { employee, locations } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  useSaveBarToast(fetcher.data, { state: fetcher.state });
  const [pin, setPin] = useState("");
  const [payrollType, setPayrollType] = useState(employee.payrollType);
  const [paymentMethod, setPaymentMethod] = useState(
    employee.paymentMethod === "PAYSTACK" ? "REVOLUT" : employee.paymentMethod,
  );
  const [bankAccountType, setBankAccountType] = useState(
    (employee.paymentMethod === "BANK_TRANSFER" ||
      employee.paymentMethod === "DIRECT_DEPOSIT")
      ? (employee.bankAccountType ?? "DOMESTIC")
      : "DOMESTIC",
  );
  const availability = new Set(
    (employee.weeklyAvailability ?? "MONDAY,TUESDAY,WEDNESDAY,THURSDAY,FRIDAY,SATURDAY")
      .split(",")
      .filter(Boolean),
  );
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
  const savedPaymentMethod =
    employee.paymentMethod === "PAYSTACK" ? "REVOLUT" : employee.paymentMethod;
  const detailsBelongToSelectedMethod =
    paymentMethod === savedPaymentMethod ||
    (BANK_PAYMENT_METHODS.includes(paymentMethod) &&
      BANK_PAYMENT_METHODS.includes(savedPaymentMethod));
  const providerEmail = detailsBelongToSelectedMethod
    ? (employee.paypalEmail ?? "")
    : "";
  const providerAccountName = detailsBelongToSelectedMethod
    ? (employee.paypalAccountName ?? "")
    : "";
  const bankDefaults = detailsBelongToSelectedMethod
    ? {
        bankAccountType: employee.bankAccountType ?? "DOMESTIC",
        bankName: employee.bankName ?? "",
        accountHolderName: employee.accountHolderName ?? "",
        accountNumber: employee.accountNumber ?? "",
        routingNumber: employee.routingNumber ?? "",
        swiftBic: employee.swiftBic ?? "",
        iban: employee.iban ?? "",
      }
    : {
        bankAccountType: "DOMESTIC",
        bankName: "",
        accountHolderName: "",
        accountNumber: "",
        routingNumber: "",
        swiftBic: "",
        iban: "",
      };

  const generatePin = () => {
    setPin(String(Math.floor(1000 + Math.random() * 9000)));
  };

  return (
    <AppPage heading="Edit Shopify Staff" inlineSize="large">
      <s-section heading={`${employee.firstName} ${employee.lastName}`}>
        <fetcher.Form method="post" data-save-bar>
          <s-stack direction="block" gap="large">
            <FormSection title="Basic Information" description="Update contact information.">
              <div className="staff-grid two">
                <Field
                  label="First Name"
                  name="firstName"
                  defaultValue={employee.firstName}
                  required
                />
                <Field
                  label="Last Name"
                  name="lastName"
                  defaultValue={employee.lastName}
                  required
                />
                <Field
                  label="Email"
                  name="email"
                  type="email"
                  defaultValue={employee.email ?? ""}
                />
                <Field
                  label="Phone (optional)"
                  name="phone"
                  type="tel"
                  defaultValue={employee.phone ?? ""}
                />
              </div>
            </FormSection>

            <FormSection title="Position" description="Permissions.">
              <label className="staff-label">
                Position
                <select
                  name="position"
                  defaultValue={normalizePosition(employee.position)}
                >
                  {POSITION_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
            </FormSection>

            <FormSection title="PIN Code" description="Leave blank to keep current PIN.">
              <p className="staff-help">
                Leave blank to keep the current PIN. Enter a new PIN or generate one to replace it.
              </p>
              <div className="staff-inline">
                <Field
                  label="New PIN Code"
                  name="pin"
                  minLength={4}
                  placeholder="Leave blank to keep current PIN"
                  value={pin}
                  onChange={(event) => setPin(event.currentTarget.value)}
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
                  defaultChecked={employee.locationAccess !== "SPECIFIC"}
                />
                All Locations
              </label>
              <label className="staff-radio">
                <input
                  type="radio"
                  name="locationAccess"
                  value="SPECIFIC"
                  defaultChecked={employee.locationAccess === "SPECIFIC"}
                />
                Specific Locations
              </label>
              <label className="staff-label">
                Specific location
                <select name="locationId" defaultValue={employee.locationId ?? ""}>
                  <option value="">Select location</option>
                  {locations.map((location) => (
                    <option key={location.id} value={location.id}>
                      {location.name}
                    </option>
                  ))}
                </select>
              </label>
            </FormSection>

            <FormSection title="Payroll Information" description="Update payroll details.">
              <div className="staff-grid three">
                {paymentMethod !== "WISE" ? (
                  <label className="staff-label">
                    Currency
                    <select name="currency" defaultValue={employee.currency}>
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
                    onChange={(event) => setPayrollType(event.currentTarget.value)}
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
                  defaultValue={
                    payrollType === "HOURLY"
                      ? String(employee.hourlyRate)
                      : String(employee.salaryAmount)
                  }
                />
              </div>
            </FormSection>

            <FormSection title="Weekly Availability" description="Update available days.">
              <div className="day-picker">
                {WEEKDAYS.map((day) => (
                  <label key={day.value} className="day-pill">
                    <input
                      type="checkbox"
                      name="weeklyAvailability"
                      value={day.value}
                      defaultChecked={availability.has(day.value)}
                    />
                    <span>{day.label}</span>
                  </label>
                ))}
              </div>
            </FormSection>

            <FormSection title="Payment Method" description="Update payout details.">
              <label className="staff-label">
                Payment Method
                <select
                  name="paymentMethod"
                  value={paymentMethod}
                  onChange={(event) => {
                    const next = event.currentTarget.value;
                    setPaymentMethod(next);
                    if (
                      BANK_PAYMENT_METHODS.includes(next) &&
                      BANK_PAYMENT_METHODS.includes(savedPaymentMethod)
                    ) {
                      setBankAccountType(
                        employee.bankAccountType ?? "DOMESTIC",
                      );
                    } else {
                      setBankAccountType("DOMESTIC");
                    }
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
                <div className="staff-grid two" key="PAYPAL">
                  <Field
                    label="PayPal Email"
                    name="paypalEmail"
                    type="email"
                    defaultValue={providerEmail}
                  />
                  <Field
                    label="PayPal Account Name"
                    name="paypalAccountName"
                    defaultValue={providerAccountName}
                  />
                </div>
              )}
              {showStripeFields && (
                <div className="staff-grid one" key="STRIPE">
                  <Field
                    label="Stripe Account Email"
                    name="paypalEmail"
                    type="email"
                    placeholder="Stripe account email address"
                    defaultValue={providerEmail}
                  />
                  <label className="staff-label">
                    Stripe Account ID
                    <input
                      name="paypalAccountName"
                      placeholder="acct_xxxxxxxxxxxxxx"
                      defaultValue={providerAccountName}
                    />
                    <span className="staff-help">
                      Stripe Connect account ID (if applicable)
                    </span>
                  </label>
                </div>
              )}
              {showWiseFields && (
                <div className="staff-grid one" key="WISE">
                  <Field
                    label="Wise Email"
                    name="paypalEmail"
                    type="email"
                    placeholder="Wise account email"
                    defaultValue={providerEmail}
                  />
                  <Field
                    label="Wise Account Holder Name"
                    name="paypalAccountName"
                    placeholder="Name on Wise account"
                    defaultValue={providerAccountName}
                  />
                  <label className="staff-label">
                    Wise Account Currency
                    <select name="currency" defaultValue={employee.currency || "USD"}>
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
                <div className="staff-grid one" key="PAYONEER">
                  <Field
                    label="Payoneer Email"
                    name="paypalEmail"
                    type="email"
                    placeholder="Payoneer account email"
                    defaultValue={providerEmail}
                  />
                  <Field
                    label="Payoneer Account Name"
                    name="paypalAccountName"
                    placeholder="Name on Payoneer account"
                    defaultValue={providerAccountName}
                  />
                </div>
              )}
              {showRevolutFields && (
                <div className="staff-grid one" key="REVOLUT">
                  <Field
                    label="Revolut Email/Phone"
                    name="paypalEmail"
                    placeholder="Email or phone linked to Revolut"
                    defaultValue={providerEmail}
                  />
                  <Field
                    label="Revolut Username"
                    name="paypalAccountName"
                    placeholder="@username (if applicable)"
                    defaultValue={providerAccountName}
                  />
                </div>
              )}
              {showVenmoFields && (
                <div className="staff-grid one" key="VENMO">
                  <Field
                    label="Venmo Username"
                    name="paypalAccountName"
                    placeholder="@username"
                    defaultValue={providerAccountName}
                  />
                  <Field
                    label="Venmo Phone Number"
                    name="paypalEmail"
                    placeholder="Phone number linked to Venmo"
                    defaultValue={providerEmail}
                  />
                </div>
              )}
              {showSquareFields && (
                <div className="staff-grid one" key="SQUARE">
                  <Field
                    label="Cash App $Cashtag"
                    name="paypalAccountName"
                    placeholder="$cashtag"
                    defaultValue={providerAccountName}
                  />
                  <Field
                    label="Cash App Phone/Email"
                    name="paypalEmail"
                    placeholder="Phone or email linked to Cash App"
                    defaultValue={providerEmail}
                  />
                </div>
              )}
              {showBankFields && (
                <div className="staff-grid one" key={`BANK-${paymentMethod}`}>
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
                    defaultValue={bankDefaults.bankName}
                  />
                  <Field
                    label="Account Holder Name"
                    name="accountHolderName"
                    placeholder="Enter account holder name"
                    defaultValue={bankDefaults.accountHolderName}
                  />
                  <Field
                    label="Account Number"
                    name="accountNumber"
                    placeholder="Enter account number"
                    defaultValue={bankDefaults.accountNumber}
                  />
                  {bankAccountType === "INTERNATIONAL" ? (
                    <>
                      <Field
                        label="SWIFT/BIC Code"
                        name="swiftBic"
                        placeholder="Enter SWIFT/BIC code"
                        defaultValue={bankDefaults.swiftBic}
                      />
                      <Field
                        label="IBAN"
                        name="iban"
                        placeholder="Enter IBAN"
                        defaultValue={bankDefaults.iban}
                      />
                    </>
                  ) : (
                    <Field
                      label="Routing Number"
                      name="routingNumber"
                      placeholder="Enter routing number"
                      defaultValue={bankDefaults.routingNumber}
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
        </fetcher.Form>
      </s-section>
      <style>{STAFF_EDIT_STYLES}</style>
    </AppPage>
  );
}

function Field({
  label,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className="staff-label">
      {label}
      <input placeholder={label} {...props} />
    </label>
  );
}

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

function normalizePosition(position: string | null) {
  const value = position ?? "Staff";
  return POSITION_OPTIONS.includes(value) ? value : "Staff";
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

const BANK_PAYMENT_METHODS = ["BANK_TRANSFER", "DIRECT_DEPOSIT"];

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

const STAFF_EDIT_STYLES = `
  .form-section {
    align-items: start;
    display: grid;
    gap: 24px;
    grid-template-columns: minmax(160px, 280px) 1fr;
    min-width: 0;
  }

  .form-section-copy {
    color: #303030;
    display: grid;
    gap: 6px;
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
    border: 1px solid #8a8a8a;
    border-radius: 6px;
    box-sizing: border-box;
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
    font-size: 13px;
    gap: 8px;
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
