import { render } from "preact";
import { useCallback, useEffect, useRef, useState } from "preact/hooks";
import {
  createTimeOffRequest,
  loadStaffTimeOff,
  loadTimeOff,
  messageFromError,
  persistTimeOffSession,
  reviewTimeOffRequest,
  showToast,
  verifyPin,
} from "./posApi";
import {
  ACTIVE_SESSION_STORAGE_KEY,
  parseStoredTimeOffSession,
  todayKey,
  type StaffOption,
  type TimeOffBootstrap,
  type TimeOffEmployee,
  type TimeOffRequestRow,
  type TimeOffTab,
} from "./session";

export default async function extension() {
  render(<TimeOffModal />, document.body);
}

function TimeOffModal() {
  const today = todayKey();
  const [employee, setEmployee] = useState<TimeOffEmployee | null>(null);
  const [bootstrap, setBootstrap] = useState<TimeOffBootstrap | null>(null);
  const [tab, setTab] = useState<TimeOffTab>("mine");
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [policyId, setPolicyId] = useState("");
  const [reason, setReason] = useState("");
  const [selectedStaffId, setSelectedStaffId] = useState("");
  const [staffRequests, setStaffRequests] = useState<TimeOffRequestRow[]>([]);
  const [booting, setBooting] = useState(true);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const pinPadOpenRef = useRef(false);

  const clearSession = useCallback(async () => {
    try {
      await shopify.storage.delete(ACTIVE_SESSION_STORAGE_KEY);
    } catch {
      // ignore
    }
    setEmployee(null);
    setBootstrap(null);
    setStaffRequests([]);
    setSelectedStaffId("");
    setTab("mine");
  }, []);

  const applyBootstrap = useCallback((data: TimeOffBootstrap) => {
    setBootstrap(data);
    setEmployee({
      id: data.employee.id,
      firstName: data.employee.firstName,
      lastName: data.employee.lastName,
      roleLabel: data.employee.roleLabel,
      canApprove: data.employee.canApprove,
    });
    setPolicyId((current) => {
      if (current && data.policies.some((policy) => policy.id === current)) {
        return current;
      }
      return data.policies[0]?.id ?? "";
    });
    if (!data.employee.canApprove) {
      setTab((current) => (current === "mine" ? current : "mine"));
    }
  }, []);

  const refreshBootstrap = useCallback(
    async (nextEmployee: TimeOffEmployee) => {
      setLoading(true);
      try {
        const data = await loadTimeOff(nextEmployee.id);
        applyBootstrap(data);
      } catch (err) {
        showToast(messageFromError(err, "Could not load time off"));
      } finally {
        setLoading(false);
      }
    },
    [applyBootstrap],
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
            await persistTimeOffSession(data);
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
                const stored = parseStoredTimeOffSession(
                  await shopify.storage.get(ACTIVE_SESSION_STORAGE_KEY),
                );
                if (!stored) return;
                setEmployee(stored.employee);
                await refreshBootstrap(stored.employee);
              })();
            }
          },
        },
      );
    } catch {
      pinPadOpenRef.current = false;
    }
  }, [refreshBootstrap]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const stored = parseStoredTimeOffSession(
          await shopify.storage.get(ACTIVE_SESSION_STORAGE_KEY),
        );
        if (!cancelled && stored) {
          setEmployee(stored.employee);
          await refreshBootstrap(stored.employee);
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
  }, [refreshBootstrap]);

  const loadStaffRequests = useCallback(
    async (actorId: string, targetId: string) => {
      if (!targetId) {
        setStaffRequests([]);
        return;
      }
      setLoading(true);
      try {
        const data = await loadStaffTimeOff({
          employeeId: actorId,
          targetEmployeeId: targetId,
        });
        setStaffRequests(data.requests);
      } catch (err) {
        showToast(messageFromError(err, "Could not load staff requests"));
        setStaffRequests([]);
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  const handleTabsChange = useCallback(
    (event: { currentTarget: { value?: string | null } }) => {
      const next = event.currentTarget.value;
      if (next === "mine" || next === "staff" || next === "approvals") {
        if (
          (next === "staff" || next === "approvals") &&
          !bootstrap?.employee.canApprove
        ) {
          showToast("Only managers can open this tab");
          return;
        }
        setTab(next);
        if (next === "staff" && employee && selectedStaffId) {
          void loadStaffRequests(employee.id, selectedStaffId);
        }
      }
    },
    [bootstrap?.employee.canApprove, employee, loadStaffRequests, selectedStaffId],
  );

  const handleSubmit = useCallback(async () => {
    if (!employee) return;
    if (!policyId) {
      showToast("Select a policy");
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
      showToast("Use valid start and end dates");
      return;
    }
    if (endDate < startDate) {
      showToast("End date must be on or after start date");
      return;
    }

    setSubmitting(true);
    try {
      await createTimeOffRequest({
        employeeId: employee.id,
        policyId,
        startDate,
        endDate,
        reason,
      });
      showToast("Time off request submitted");
      setReason("");
      await refreshBootstrap(employee);
    } catch (err) {
      showToast(messageFromError(err, "Could not submit request"));
    } finally {
      setSubmitting(false);
    }
  }, [employee, endDate, policyId, reason, refreshBootstrap, startDate]);

  const handleReview = useCallback(
    async (requestId: string, status: "APPROVED" | "DECLINED") => {
      if (!employee) return;
      setReviewingId(requestId);
      try {
        const result = await reviewTimeOffRequest({
          employeeId: employee.id,
          requestId,
          status,
        });
        showToast(result.message);
        await refreshBootstrap(employee);
        if (selectedStaffId) {
          await loadStaffRequests(employee.id, selectedStaffId);
        }
      } catch (err) {
        showToast(messageFromError(err, "Could not update request"));
      } finally {
        setReviewingId(null);
      }
    },
    [employee, loadStaffRequests, refreshBootstrap, selectedStaffId],
  );

  if (booting) {
    return (
      <s-page heading="Time Off">
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
      <s-page heading="Time Off">
        <s-scroll-box>
          <s-box padding="large">
            <s-stack direction="block" gap="base">
              <s-text>Enter your staff PIN to manage time off.</s-text>
              <s-button variant="primary" onClick={showNativePinPad}>
                Enter PIN
              </s-button>
            </s-stack>
          </s-box>
        </s-scroll-box>
      </s-page>
    );
  }

  const canApprove = Boolean(
    bootstrap?.employee.canApprove ?? employee.canApprove,
  );
  const tabs: Array<{ id: TimeOffTab; label: string }> = canApprove
    ? [
        { id: "mine", label: "My Requests" },
        { id: "staff", label: "Staff Requests" },
        { id: "approvals", label: "Approvals" },
      ]
    : [{ id: "mine", label: "My Requests" }];

  const policies = bootstrap?.policies ?? [];
  const myRequests = bootstrap?.myRequests ?? [];
  const staff = bootstrap?.staff ?? [];
  const pendingApprovals = bootstrap?.pendingApprovals ?? [];
  const approvedApprovals = bootstrap?.approvedApprovals ?? [];
  const declinedApprovals = bootstrap?.declinedApprovals ?? [];

  return (
    <s-page heading="Time Off">
      <s-scroll-box>
        <s-box padding="large">
          <s-stack direction="block" gap="large">
            <s-stack direction="block" gap="small">
              <s-stack direction="inline" gap="small" alignItems="center">
                <s-heading>
                  👋 Welcome, {employee.firstName} {employee.lastName}
                </s-heading>
                <s-badge tone="info">
                  {employee.roleLabel ??
                    bootstrap?.employee.roleLabel ??
                    "Staff"}
                </s-badge>
              </s-stack>
              {loading ? <s-text>Refreshing…</s-text> : null}
            </s-stack>

            <s-tabs value={tab} onChange={handleTabsChange}>
              <s-tab-list>
                {tabs.map((item) => (
                  <s-tab key={item.id} controls={item.id}>
                    {item.label}
                  </s-tab>
                ))}
              </s-tab-list>

              <s-tab-panel id="mine">
                <s-box padding="base none">
                  <MyRequestsTab
                    startDate={startDate}
                    endDate={endDate}
                    policyId={policyId}
                    reason={reason}
                    policies={policies}
                    requests={myRequests}
                    submitting={submitting}
                    onStartDateChange={setStartDate}
                    onEndDateChange={setEndDate}
                    onPolicyChange={setPolicyId}
                    onReasonChange={setReason}
                    onSubmit={() => {
                      void handleSubmit();
                    }}
                  />
                </s-box>
              </s-tab-panel>

              {canApprove ? (
                <s-tab-panel id="staff">
                  <s-box padding="base none">
                    <StaffRequestsTab
                      staff={staff}
                      selectedStaffId={selectedStaffId}
                      requests={staffRequests}
                      loading={loading}
                      reviewingId={reviewingId}
                      onReview={handleReview}
                      onSelectStaff={(id) => {
                        setSelectedStaffId(id);
                        if (employee) {
                          void loadStaffRequests(employee.id, id);
                        }
                      }}
                    />
                  </s-box>
                </s-tab-panel>
              ) : null}

              {canApprove ? (
                <s-tab-panel id="approvals">
                  <s-box padding="base none">
                    <ApprovalsTab
                      pendingRequests={pendingApprovals}
                      approvedRequests={approvedApprovals}
                      declinedRequests={declinedApprovals}
                      reviewingId={reviewingId}
                      onReview={handleReview}
                    />
                  </s-box>
                </s-tab-panel>
              ) : null}
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

function MyRequestsTab(props: {
  startDate: string;
  endDate: string;
  policyId: string;
  reason: string;
  policies: TimeOffBootstrap["policies"];
  requests: TimeOffRequestRow[];
  submitting: boolean;
  onStartDateChange: (value: string) => void;
  onEndDateChange: (value: string) => void;
  onPolicyChange: (value: string) => void;
  onReasonChange: (value: string) => void;
  onSubmit: () => void;
}) {
  const {
    startDate,
    endDate,
    policyId,
    reason,
    policies,
    requests,
    submitting,
    onStartDateChange,
    onEndDateChange,
    onPolicyChange,
    onReasonChange,
    onSubmit,
  } = props;

  return (
    <s-stack direction="block" gap="large">
      <s-section heading="Request Dates">
        <s-box padding="small none">
          <s-stack direction="block" gap="base">
            <s-date-field
              label="Start Date"
              value={startDate}
              onChange={(event) => {
                onStartDateChange(event.currentTarget.value ?? "");
              }}
            />
            <s-date-field
              label="End Date"
              value={endDate}
              onChange={(event) => {
                onEndDateChange(event.currentTarget.value ?? "");
              }}
            />
          </s-stack>
        </s-box>
      </s-section>

      <s-section heading="Select Policy">
        <s-box padding="small none">
          {policies.length === 0 ? (
            <s-text>No time off policies available for you.</s-text>
          ) : (
            <s-choice-list
              values={policyId ? [policyId] : []}
              onChange={(event) => {
                const next = event.currentTarget.values?.[0] ?? "";
                onPolicyChange(next);
              }}
            >
              {policies.map((policy) => (
                <s-choice key={policy.id} value={policy.id}>
                  {policy.name}
                </s-choice>
              ))}
            </s-choice-list>
          )}
        </s-box>
      </s-section>

      <s-section heading="Reason">
        <s-box padding="small none">
          <s-text-area
            label="Reason"
            placeholder="Reason for time off"
            value={reason}
            onInput={(event) => {
              onReasonChange(event.currentTarget.value ?? "");
            }}
          />
        </s-box>
      </s-section>

      <s-button
        variant="primary"
        loading={submitting}
        disabled={submitting || policies.length === 0}
        onClick={onSubmit}
      >
        Submit Request
      </s-button>

      <s-section heading="Request History">
        <s-box padding="small none">
          {requests.length === 0 ? (
            <s-stack direction="block" gap="small">
              <s-heading>No History Available</s-heading>
              <s-text>No time off requests found.</s-text>
            </s-stack>
          ) : (
            <s-stack direction="block" gap="base">
              {requests.map((request) => (
                <s-box key={request.id} padding="small none">
                  <RequestCard request={request} />
                </s-box>
              ))}
            </s-stack>
          )}
        </s-box>
      </s-section>
    </s-stack>
  );
}

function StaffRequestsTab(props: {
  staff: StaffOption[];
  selectedStaffId: string;
  requests: TimeOffRequestRow[];
  loading: boolean;
  reviewingId: string | null;
  onReview: (
    requestId: string,
    status: "APPROVED" | "DECLINED",
  ) => Promise<void>;
  onSelectStaff: (id: string) => void;
}) {
  const {
    staff,
    selectedStaffId,
    requests,
    loading,
    reviewingId,
    onReview,
    onSelectStaff,
  } = props;

  if (staff.length === 0) {
    return (
      <s-stack direction="block" gap="base">
        <s-heading>Select Staff Member</s-heading>
        <s-text>No staff members available.</s-text>
      </s-stack>
    );
  }

  return (
    <s-stack direction="block" gap="large">
      <s-section heading="Select Staff Member">
        <s-box padding="small none">
          <s-choice-list
            values={selectedStaffId ? [selectedStaffId] : []}
            onChange={(event) => {
              const next = event.currentTarget.values?.[0] ?? "";
              onSelectStaff(next);
            }}
          >
            {staff.map((member) => (
              <s-choice key={member.id} value={member.id}>
                {`${member.name} — ${member.roleLabel}`}
              </s-choice>
            ))}
          </s-choice-list>
        </s-box>
      </s-section>

      {!selectedStaffId ? (
        <s-text>Select a staff member to view their requests.</s-text>
      ) : loading ? (
        <s-text>Loading requests…</s-text>
      ) : requests.length === 0 ? (
        <s-text>No time off requests for this staff member.</s-text>
      ) : (
        <s-stack direction="block" gap="base">
          {requests.map((request) => (
            <s-box key={request.id} padding="small none">
              <s-stack direction="block" gap="base">
                <RequestCard request={request} />
                {!request.canReview ? (
                  <s-text>Past dates — approve/decline unavailable</s-text>
                ) : request.status === "PENDING" ? (
                  <s-stack direction="inline" gap="small">
                    <s-button
                      variant="primary"
                      loading={reviewingId === request.id}
                      disabled={reviewingId !== null}
                      onClick={() => {
                        void onReview(request.id, "APPROVED");
                      }}
                    >
                      Approve
                    </s-button>
                    <s-button
                      variant="primary"
                      tone="critical"
                      loading={reviewingId === request.id}
                      disabled={reviewingId !== null}
                      onClick={() => {
                        void onReview(request.id, "DECLINED");
                      }}
                    >
                      Decline
                    </s-button>
                  </s-stack>
                ) : request.status === "APPROVED" ? (
                  <s-button
                    variant="primary"
                    tone="critical"
                    loading={reviewingId === request.id}
                    disabled={reviewingId !== null}
                    onClick={() => {
                      void onReview(request.id, "DECLINED");
                    }}
                  >
                    Decline
                  </s-button>
                ) : request.status === "DECLINED" ? (
                  <s-button
                    variant="primary"
                    loading={reviewingId === request.id}
                    disabled={reviewingId !== null}
                    onClick={() => {
                      void onReview(request.id, "APPROVED");
                    }}
                  >
                    Approve
                  </s-button>
                ) : null}
              </s-stack>
            </s-box>
          ))}
        </s-stack>
      )}
    </s-stack>
  );
}

function ApprovalsTab(props: {
  pendingRequests: TimeOffRequestRow[];
  approvedRequests: TimeOffRequestRow[];
  declinedRequests: TimeOffRequestRow[];
  reviewingId: string | null;
  onReview: (
    requestId: string,
    status: "APPROVED" | "DECLINED",
  ) => Promise<void>;
}) {
  const {
    pendingRequests,
    approvedRequests,
    declinedRequests,
    reviewingId,
    onReview,
  } = props;

  return (
    <s-stack direction="block" gap="large">
      <s-stack
        direction="inline"
        gap="small"
        alignItems="center"
        justifyContent="space-between"
        inlineSize="100%"
      >
        <s-heading>Pending Requests</s-heading>
        <s-badge tone={pendingRequests.length === 0 ? "success" : "warning"}>
          {pendingRequests.length === 0
            ? "All Processed"
            : `${pendingRequests.length} Pending`}
        </s-badge>
      </s-stack>

      {pendingRequests.length === 0 ? (
        <s-stack direction="block" gap="small">
          <s-text>No pending time off requests require action.</s-text>
        </s-stack>
      ) : (
        <s-stack direction="block" gap="base">
          {pendingRequests.map((request) => (
            <s-section key={request.id} heading={request.employeeName}>
              <s-box padding="small none">
                <s-stack direction="block" gap="base">
                  <RequestCard request={request} />
                  {!request.canReview ? (
                    <s-text>Past dates — approve/decline unavailable</s-text>
                  ) : (
                    <s-stack direction="inline" gap="small">
                      <s-button
                        variant="primary"
                        loading={reviewingId === request.id}
                        disabled={reviewingId !== null}
                        onClick={() => {
                          void onReview(request.id, "APPROVED");
                        }}
                      >
                        Approve
                      </s-button>
                      <s-button
                        variant="primary"
                        tone="critical"
                        loading={reviewingId === request.id}
                        disabled={reviewingId !== null}
                        onClick={() => {
                          void onReview(request.id, "DECLINED");
                        }}
                      >
                        Decline
                      </s-button>
                    </s-stack>
                  )}
                </s-stack>
              </s-box>
            </s-section>
          ))}
        </s-stack>
      )}

      <s-stack
        direction="inline"
        gap="small"
        alignItems="center"
        justifyContent="space-between"
        inlineSize="100%"
      >
        <s-heading>Approved Requests</s-heading>
        <s-badge tone={approvedRequests.length === 0 ? "neutral" : "info"}>
          {approvedRequests.length} Approved
        </s-badge>
      </s-stack>

      {approvedRequests.length === 0 ? (
        <s-text>No approved requests to review.</s-text>
      ) : (
        <s-stack direction="block" gap="base">
          {approvedRequests.map((request) => (
            <s-section key={request.id} heading={request.employeeName}>
              <s-box padding="small none">
                <s-stack direction="block" gap="base">
                  <RequestCard request={request} />
                  {!request.canReview ? (
                    <s-text>Past dates — approve/decline unavailable</s-text>
                  ) : (
                    <s-button
                      variant="primary"
                      tone="critical"
                      loading={reviewingId === request.id}
                      disabled={reviewingId !== null}
                      onClick={() => {
                        void onReview(request.id, "DECLINED");
                      }}
                    >
                      Decline
                    </s-button>
                  )}
                </s-stack>
              </s-box>
            </s-section>
          ))}
        </s-stack>
      )}

      <s-stack
        direction="inline"
        gap="small"
        alignItems="center"
        justifyContent="space-between"
        inlineSize="100%"
      >
        <s-heading>Declined Requests</s-heading>
        <s-badge tone={declinedRequests.length === 0 ? "neutral" : "critical"}>
          {declinedRequests.length} Declined
        </s-badge>
      </s-stack>

      {declinedRequests.length === 0 ? (
        <s-text>No declined requests to review.</s-text>
      ) : (
        <s-stack direction="block" gap="base">
          {declinedRequests.map((request) => (
            <s-section key={request.id} heading={request.employeeName}>
              <s-box padding="small none">
                <s-stack direction="block" gap="base">
                  <RequestCard request={request} />
                  {!request.canReview ? (
                    <s-text>Past dates — approve/decline unavailable</s-text>
                  ) : (
                    <s-button
                      variant="primary"
                      loading={reviewingId === request.id}
                      disabled={reviewingId !== null}
                      onClick={() => {
                        void onReview(request.id, "APPROVED");
                      }}
                    >
                      Approve
                    </s-button>
                  )}
                </s-stack>
              </s-box>
            </s-section>
          ))}
        </s-stack>
      )}
    </s-stack>
  );
}

function RequestCard(props: { request: TimeOffRequestRow }) {
  const { request } = props;
  const badgeTone = request.tone === "neutral" ? "auto" : request.tone;
  return (
    <s-stack direction="block" gap="small">
      <s-stack
        direction="inline"
        gap="small"
        alignItems="center"
        justifyContent="space-between"
        inlineSize="100%"
      >
        <s-text type="strong">{request.policyName}</s-text>
        <s-badge tone={badgeTone}>{request.statusLabel}</s-badge>
      </s-stack>
      <s-text>
        {request.startDate}
        {request.endDate !== request.startDate ? ` → ${request.endDate}` : ""}
      </s-text>
      {request.reason ? <s-text>{request.reason}</s-text> : null}
    </s-stack>
  );
}
