import { render } from "preact";
import { useCallback, useEffect, useRef, useState } from "preact/hooks";
import {
  fetchProfile,
  fetchShifts,
  messageFromError,
  persistProfileSession,
  showToast,
  verifyPin,
} from "./posApi";
import {
  ACTIVE_SESSION_STORAGE_KEY,
  parseStoredProfileSession,
  shiftsTitleForEmployee,
  type PosShiftRange,
  type PosShiftRow,
  type ProfileEmployee,
  type StaffProfile,
} from "./session";

type ProfileTab = "profile" | PosShiftRange;

const TABS: Array<{ id: ProfileTab; label: string }> = [
  { id: "profile", label: "Profile" },
  { id: "upcoming", label: "Upcoming" },
  { id: "today", label: "Today" },
  { id: "week", label: "This Week" },
  { id: "month", label: "This Month" },
];

export default async function extension() {
  render(<StaffProfileModal />, document.body);
}

function StaffProfileModal() {
  const [employee, setEmployee] = useState<ProfileEmployee | null>(null);
  const [profile, setProfile] = useState<StaffProfile | null>(null);
  const [tab, setTab] = useState<ProfileTab>("upcoming");
  const [shifts, setShifts] = useState<PosShiftRow[]>([]);
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
    setShifts([]);
  }, []);

  const loadProfile = useCallback(async (nextEmployee: ProfileEmployee) => {
    const data = await fetchProfile(nextEmployee.id);
    setProfile(data);
    setEmployee({
      id: data.employee.id,
      firstName: data.employee.firstName,
      lastName: data.employee.lastName,
      fullName: data.employee.fullName,
      titlePrefix: data.employee.titlePrefix,
    });
    return data;
  }, []);

  const loadShifts = useCallback(
    async (nextEmployee: ProfileEmployee, range: PosShiftRange) => {
      const data = await fetchShifts(nextEmployee.id, range);
      setShifts(data.shifts);
    },
    [],
  );

  const loadTabData = useCallback(
    async (nextEmployee: ProfileEmployee, nextTab: ProfileTab) => {
      setLoading(true);
      try {
        if (nextTab === "profile") {
          await loadProfile(nextEmployee);
        } else {
          await loadProfile(nextEmployee);
          await loadShifts(nextEmployee, nextTab);
        }
      } catch (err) {
        showToast(messageFromError(err, "Could not load staff profile"));
        if (nextTab !== "profile") setShifts([]);
      } finally {
        setLoading(false);
      }
    },
    [loadProfile, loadShifts],
  );

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
                setTab("upcoming");
                await loadTabData(stored.employee, "upcoming");
              })();
            }
          },
        },
      );
    } catch {
      pinPadOpenRef.current = false;
    }
  }, [loadTabData]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const stored = parseStoredProfileSession(
          await shopify.storage.get(ACTIVE_SESSION_STORAGE_KEY),
        );
        if (!cancelled && stored) {
          setEmployee(stored.employee);
          setTab("upcoming");
          await loadTabData(stored.employee, "upcoming");
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- boot once
  }, []);

  const onSelectTab = useCallback(
    (nextTab: ProfileTab) => {
      setTab(nextTab);
      if (employee) {
        void loadTabData(employee, nextTab);
      }
    },
    [employee, loadTabData],
  );

  const handleTabsChange = useCallback(
    (event: { currentTarget: { value?: string | null } }) => {
      const next = event.currentTarget.value;
      if (!isProfileTab(next) || next === tab) return;
      onSelectTab(next);
    },
    [onSelectTab, tab],
  );

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
              <s-text>Enter your staff PIN to view your profile and shifts.</s-text>
              <s-button variant="primary" onClick={showNativePinPad}>
                Enter PIN
              </s-button>
            </s-stack>
          </s-box>
        </s-scroll-box>
      </s-page>
    );
  }

  const heading = shiftsTitleForEmployee(employee);

  const tabContent =
    loading ? (
      <s-text>Loading…</s-text>
    ) : tab === "profile" ? (
      profile ? (
        <ProfilePanel profile={profile} />
      ) : (
        <s-text>Could not load profile.</s-text>
      )
    ) : shifts.length === 0 ? (
      <s-text>No shifts in this range.</s-text>
    ) : (
      <s-stack direction="block" gap="base">
        {shifts.map((shift) => (
          <ShiftRow key={shift.id} shift={shift} />
        ))}
      </s-stack>
    );

  return (
    <s-page heading={heading}>
      <s-scroll-box>
        <s-box padding="large">
          <s-stack direction="block" gap="large">
            <s-tabs value={tab} onChange={handleTabsChange}>
              <s-tab-list>
                {TABS.map((item) => (
                  <s-tab key={item.id} controls={item.id}>
                    {item.label}
                  </s-tab>
                ))}
              </s-tab-list>
              {TABS.map((item) => (
                <s-tab-panel key={item.id} id={item.id}>
                  <s-box padding="base none">{tabContent}</s-box>
                </s-tab-panel>
              ))}
            </s-tabs>

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

function isProfileTab(value: unknown): value is ProfileTab {
  return (
    value === "profile" ||
    value === "upcoming" ||
    value === "today" ||
    value === "week" ||
    value === "month"
  );
}

function ProfilePanel(props: { profile: StaffProfile }) {
  const { profile } = props;
  const statusTone =
    profile.clockStatus === "CLOCKED_IN"
      ? "success"
      : profile.clockStatus === "ON_BREAK"
        ? "warning"
        : "critical";

  return (
    <s-stack direction="block" gap="large">
      <s-stack direction="block" gap="small">
        <s-stack direction="inline" gap="small" alignItems="center">
          <s-icon type="person-filled" color="strong" />
          <s-heading>{profile.employee.fullName}</s-heading>
        </s-stack>
        <s-stack direction="inline" gap="small" alignItems="center">
          <s-badge tone="info">{profile.employee.roleLabel}</s-badge>
          <s-badge
            tone={
              profile.employee.statusLabel === "Active" ? "success" : "neutral"
            }
          >
            {profile.employee.statusLabel}
          </s-badge>
          <s-badge tone={statusTone}>{profile.clockStatusLabel}</s-badge>
        </s-stack>
      </s-stack>

      <s-stack direction="block" gap="none">
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
          showDivider
        />
        <InfoRow
          emoji="🕰️"
          label="Today's shift"
          value={profile.todayShift?.timeRangeLabel ?? "No shift today"}
        />
      </s-stack>
    </s-stack>
  );
}

function ShiftRow(props: { shift: PosShiftRow }) {
  const { shift } = props;
  return (
    <s-box padding="small none">
      <s-stack direction="block" gap="small">
        <s-stack
          direction="inline"
          gap="small"
          alignItems="center"
          justifyContent="space-between"
          inlineSize="100%"
        >
          <s-stack direction="inline" gap="small" alignItems="center">
            <s-icon type="clock" color="strong" />
            <s-text type="strong">{shift.dateLabel}</s-text>
            <s-badge tone="neutral">{shift.dayLabel}</s-badge>
          </s-stack>
        </s-stack>
        <s-stack
          direction="inline"
          gap="base"
          alignItems="center"
          justifyContent="space-between"
          inlineSize="100%"
        >
          <s-heading>{shift.timeRangeLabel}</s-heading>
          <s-badge tone={shift.tone}>{shift.statusLabel}</s-badge>
        </s-stack>
        {shift.locationName ? (
          <s-stack direction="inline" gap="small" alignItems="center">
            <s-text>📍</s-text>
            <s-text>{shift.locationName}</s-text>
          </s-stack>
        ) : null}
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
