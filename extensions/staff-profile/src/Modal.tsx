import { render } from "preact";
import { useCallback, useEffect, useRef, useState } from "preact/hooks";
import {
  fetchProfile,
  messageFromError,
  persistProfileSession,
  showToast,
  verifyPin,
} from "./posApi";
import {
  ACTIVE_SESSION_STORAGE_KEY,
  pageTitleForEmployee,
  parseStoredProfileSession,
  type ProfileEmployee,
  type StaffProfile,
} from "./session";

export default async function extension() {
  render(<StaffProfileModal />, document.body);
}

function StaffProfileModal() {
  const [employee, setEmployee] = useState<ProfileEmployee | null>(null);
  const [profile, setProfile] = useState<StaffProfile | null>(null);
  const [booting, setBooting] = useState(true);
  const [loading, setLoading] = useState(false);
  const pinPadOpenRef = useRef(false);

  const clearSession = useCallback(async () => {
    try {
      await shopify.storage.delete(ACTIVE_SESSION_STORAGE_KEY);
    } catch {
      // ignore
    }
    setEmployee(null);
    setProfile(null);
  }, []);

  const loadProfile = useCallback(async (nextEmployee: ProfileEmployee) => {
    setLoading(true);
    try {
      const data = await fetchProfile(nextEmployee.id);
      setProfile(data);
      setEmployee({
        id: data.employee.id,
        firstName: data.employee.firstName,
        lastName: data.employee.lastName,
        fullName: data.employee.fullName,
        titlePrefix: data.employee.titlePrefix,
      });
    } catch (err) {
      showToast(messageFromError(err, "Could not load profile"));
      setProfile(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const showNativePinPad = useCallback(() => {
    if (pinPadOpenRef.current) return;

    if (!shopify.pinPad || typeof shopify.pinPad.showPinPad !== "function") {
      showToast("PIN pad is unavailable on this POS version.");
      return;
    }

    pinPadOpenRef.current = true;

    try {
      shopify.pinPad.showPinPad(
        async (pinDigits) => {
          const pin = pinDigits.join("");
          try {
            const data = await verifyPin(pin);
            await persistProfileSession(data);
            showToast(`Welcome, ${data.employee.firstName}`);
            return { result: "accept" as const };
          } catch (err) {
            return {
              result: "reject" as const,
              errorMessage: messageFromError(err, "Invalid PIN"),
            };
          }
        },
        {
          title: "Enter PIN",
          label: "Enter your PIN",
          masked: true,
          minPinLength: 4,
          maxPinLength: 4,
          autoSubmit: true,
          onDismissed: (result) => {
            pinPadOpenRef.current = false;
            if (result.completed) {
              void (async () => {
                const stored = parseStoredProfileSession(
                  await shopify.storage.get(ACTIVE_SESSION_STORAGE_KEY),
                );
                if (!stored) return;
                setEmployee(stored.employee);
                await loadProfile(stored.employee);
              })();
            }
          },
        },
      );
    } catch {
      pinPadOpenRef.current = false;
    }
  }, [loadProfile]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const stored = parseStoredProfileSession(
          await shopify.storage.get(ACTIVE_SESSION_STORAGE_KEY),
        );
        if (!cancelled && stored) {
          setEmployee(stored.employee);
          await loadProfile(stored.employee);
        }
      } catch {
        // Stay on unlock UI.
      } finally {
        if (!cancelled) setBooting(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadProfile]);

  if (booting) {
    return (
      <s-page heading="Staff Profile">
        <s-scroll-box>
          <s-box padding="large">
            <s-text>Loading…</s-text>
          </s-box>
        </s-scroll-box>
      </s-page>
    );
  }

  if (!employee) {
    return (
      <s-page heading="Staff Profile">
        <s-scroll-box>
          <s-box padding="large">
            <s-stack direction="block" gap="base">
              <s-text>Enter your staff PIN to view your profile.</s-text>
              <s-button variant="primary" onClick={showNativePinPad}>
                Enter PIN
              </s-button>
            </s-stack>
          </s-box>
        </s-scroll-box>
      </s-page>
    );
  }

  const heading = pageTitleForEmployee(employee);
  const statusTone =
    profile?.clockStatus === "CLOCKED_IN"
      ? "success"
      : profile?.clockStatus === "ON_BREAK"
        ? "warning"
        : "critical";

  return (
    <s-page heading={heading}>
      <s-scroll-box>
        <s-box padding="large">
          <s-stack direction="block" gap="large">
            {loading || !profile ? (
              <s-text>Loading profile…</s-text>
            ) : (
              <>
                <s-stack direction="block" gap="small">
                  <s-stack
                    direction="inline"
                    gap="small"
                    alignItems="center"
                  >
                    <s-icon type="person-filled" color="strong" />
                    <s-heading>{profile.employee.fullName}</s-heading>
                  </s-stack>
                  <s-stack
                    direction="inline"
                    gap="small"
                    alignItems="center"
                  >
                    <s-badge tone="info">{profile.employee.roleLabel}</s-badge>
                    <s-badge
                      tone={
                        profile.employee.statusLabel === "Active"
                          ? "success"
                          : "neutral"
                      }
                    >
                      {profile.employee.statusLabel}
                    </s-badge>
                    <s-badge tone={statusTone}>
                      {profile.clockStatusLabel}
                    </s-badge>
                  </s-stack>
                </s-stack>

                <s-section>
                  <s-box padding="small none">
                    <s-stack direction="block" gap="none">
                      <SectionTitle emoji="👤" label="Profile" />
                      <InfoRow
                        emoji="💼"
                        label="Position"
                        value={profile.employee.position}
                        showDivider
                      />
                      <InfoRow
                        emoji="🏢"
                        label="Department"
                        value={profile.employee.department}
                        showDivider
                      />
                      <InfoRow
                        emoji="📍"
                        label="Location"
                        value={profile.employee.locationName}
                        showDivider
                      />
                      <InfoRow
                        emoji="✉️"
                        label="Email"
                        value={profile.employee.email}
                        showDivider
                      />
                      <InfoRow
                        emoji="📞"
                        label="Phone"
                        value={profile.employee.phone}
                      />
                    </s-stack>
                  </s-box>
                </s-section>

                <s-section>
                  <s-box padding="small none">
                    <s-stack direction="block" gap="base">
                      <SectionTitle emoji="📌" label="Today" />
                      <InfoRow
                        emoji="🕰️"
                        label="Today's shift"
                        value={
                          profile.todayShift?.timeRangeLabel ?? "No shift today"
                        }
                      />
                    </s-stack>
                  </s-box>
                </s-section>
              </>
            )}

            <s-button
              variant="secondary"
              onClick={() => {
                void clearSession();
              }}
            >
              <s-stack direction="inline" gap="small" alignItems="center">
                <s-icon type="person" color="strong" />
                <s-text>Switch employee</s-text>
              </s-stack>
            </s-button>
          </s-stack>
        </s-box>
      </s-scroll-box>
    </s-page>
  );
}

function SectionTitle(props: { emoji: string; label: string }) {
  return (
    <s-box padding="small none">
      <s-stack direction="inline" gap="small" alignItems="center">
        <s-text>{props.emoji}</s-text>
        <s-text>{props.label}</s-text>
      </s-stack>
    </s-box>
  );
}

function InfoRow(props: {
  emoji: string;
  label: string;
  value: string;
  showDivider?: boolean;
}) {
  return (
    <s-stack direction="block" gap="none">
      <s-box padding="small none">
        <s-stack
          direction="inline"
          gap="base"
          alignItems="center"
          justifyContent="space-between"
          inlineSize="100%"
        >
          <s-stack direction="inline" gap="small" alignItems="center">
            <s-text>{props.emoji}</s-text>
            <s-text>{props.label}</s-text>
          </s-stack>
          <s-text type="strong">{props.value}</s-text>
        </s-stack>
      </s-box>
      {props.showDivider ? <s-divider /> : null}
    </s-stack>
  );
}
