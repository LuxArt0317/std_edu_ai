import { requestText } from "@/lib/decisions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { useEffect, useState } from "react";
import type { CrmUser } from "../../crm/authService";
import {
  assignPlatformRole,
  assignProfileResponsibilities,
  changeAccountLifecycle,
  inviteRoleAccount,
  loadAccountDirectory,
  provisionRoleAccount,
  removeProfileSectionAssignment,
  resendRoleInvitation,
  revokeAccountSessions,
  updateAccountIdentity,
  updateDepartmentStaffProfile,
  updatePlatformProfile,
  updateRoleCapabilities,
} from "../platformRepository";
import type {
  AuthDirectoryAccount,
  PlatformData,
  PlatformProfile,
  PlatformRole,
} from "../types";

import {
  formatMoment,
  generateTemporaryPassword,
  PageIntro,
  Pill,
  roleNames,
} from "./shared";
export function RoleCapabilityPicker({
  roleCode,
  initialCapabilities,
  catalog,
  onCancel,
  onSaved,
  onToast,
}: {
  roleCode: Exclude<PlatformRole, "owner">;
  initialCapabilities: string[];
  catalog: string[];
  onCancel: () => void;
  onSaved: () => void;
  onToast: (message: string) => void;
}) {
  const [selected, setSelected] = useState(() => new Set(initialCapabilities));
  const [query, setQuery] = useState("");
  const [saving, setSaving] = useState(false);
  const normalizedQuery = query.trim().toLowerCase();
  const options = catalog.filter(
    (capability) =>
      !selected.has(capability) &&
      (!normalizedQuery ||
        capability.replaceAll("_", " ").includes(normalizedQuery)),
  );
  const add = (capability: string) => {
    setSelected((current) => new Set([...current, capability]));
    setQuery("");
  };
  return (
    <form
      className="academic-form role-capability-form"
      onSubmit={(event) => {
        event.preventDefault();
        setSaving(true);
        void updateRoleCapabilities(roleCode, [...selected])
          .then(() => {
            onToast("Role capability policy updated.");
            onSaved();
          })
          .catch((error: unknown) =>
            onToast(
              error instanceof Error
                ? error.message
                : "Permission update failed.",
            ),
          )
          .finally(() => setSaving(false));
      }}
    >
      <div className="role-capability-picker">
        <Label htmlFor="role-capability-search">
          <span>Find and add a capability</span>
        </Label>
        <div
          className="capability-combobox"
          role="combobox"
          aria-expanded={Boolean(options.length)}
          aria-controls="role-capability-options"
          aria-haspopup="listbox"
        >
          <Input
            id="role-capability-search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search learning, grades, schedules…"
            autoComplete="off"
          />
          {options.length ? (
            <div id="role-capability-options" role="listbox">
              {options.slice(0, 12).map((capability) => (
                <Button
                  type="button"
                  role="option"
                  aria-selected="false"
                  key={capability}
                  onClick={() => add(capability)}
                >
                  <b>{capability.replaceAll("_", " ")}</b>
                  <small>Add capability</small>
                </Button>
              ))}
            </div>
          ) : query ? (
            <div className="capability-no-results">
              No governed capability matches this search.
            </div>
          ) : null}
        </div>
        <section aria-label={`Selected capabilities for ${roleCode}`}>
          <header>
            <b>Selected capabilities</b>
            <small>{selected.size} enabled</small>
          </header>
          <div>
            {[...selected].sort().map((capability) => (
              <Button
                type="button"
                key={capability}
                onClick={() =>
                  setSelected((current) => {
                    const next = new Set(current);
                    next.delete(capability);
                    return next;
                  })
                }
              >
                {capability.replaceAll("_", " ")}{" "}
                <span aria-hidden="true">×</span>
                <span className="sr-only">Remove</span>
              </Button>
            ))}
          </div>
          {!selected.size ? (
            <p>Select at least one capability from the searchable list.</p>
          ) : null}
        </section>
      </div>
      <footer>
        <span>
          These labels guide governance and UI access. Database RLS remains the
          enforcement boundary.
        </span>
        <div>
          <Button type="button" className="secondary" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving || !selected.size}>
            {saving ? "Saving…" : "Save role policy"}
          </Button>
        </div>
      </footer>
    </form>
  );
}

export function PeopleView({
  data,
  currentUser,
  onChanged,
  onToast,
}: {
  data: PlatformData;
  currentUser: CrmUser;
  onChanged: () => void;
  onToast: (message: string) => void;
}) {
  const [changing, setChanging] = useState("");
  const [managingProfileId, setManagingProfileId] = useState("");
  const [editingProfileId, setEditingProfileId] = useState("");
  const [profileDepartmentId, setProfileDepartmentId] = useState("");
  const [profileProgramId, setProfileProgramId] = useState("");
  const [pendingRoleChange, setPendingRoleChange] = useState<{
    profileId: string;
    previousRole: PlatformRole;
    nextRole: PlatformRole;
  } | null>(null);
  const [pendingLifecycle, setPendingLifecycle] = useState<{
    profileId: string;
    action: "activate" | "suspend" | "archive" | "restore";
  } | null>(null);
  const [provisioning, setProvisioning] = useState(false);
  const [showProvisioner, setShowProvisioner] = useState(false);
  const [inviteMode, setInviteMode] = useState(false);
  const [showBulkProvisioner, setShowBulkProvisioner] = useState(false);
  const [bulkAccounts, setBulkAccounts] = useState("");
  const [bulkResults, setBulkResults] = useState("");
  const [directory, setDirectory] = useState<AuthDirectoryAccount[]>([]);
  const [accountSearch, setAccountSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("active");
  const [roleFilter, setRoleFilter] = useState("all");
  const [directoryPage, setDirectoryPage] = useState(1);
  const [directoryError, setDirectoryError] = useState("");
  const [pendingSessionRevoke, setPendingSessionRevoke] = useState<string>("");
  const [rotatingProfileId, setRotatingProfileId] = useState("");
  const exportGovernanceAudit = () => {
    const rows = [
      ["Timestamp", "Target", "Transition", "Reason", "Actor"],
      ...[...data.accountAudits, ...data.roleAudits, ...data.accessAudits]
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
        .map((entry) => {
          const target = data.profiles.find(
            (profile) => profile.id === entry.targetProfileId,
          );
          const actor = data.profiles.find(
            (profile) => profile.id === entry.changedBy,
          );
          const transition =
            "action" in entry
              ? entry.action
              : "newStatus" in entry
                ? `${entry.previousStatus} → ${entry.newStatus}`
                : `${entry.previousRole} → ${entry.newRole}`;
          return [
            entry.createdAt,
            target?.name ?? entry.targetProfileId,
            transition,
            entry.reason,
            actor?.name ?? entry.changedBy,
          ];
        }),
    ];
    const csv = rows
      .map((row) =>
        row
          .map((value) => `"${String(value).replaceAll('"', '""')}"`)
          .join(","),
      )
      .join("\r\n");
    const url = URL.createObjectURL(
      new Blob([csv], { type: "text/csv;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `stu-governance-audit-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    onToast("Authorized governance audit exported.");
  };
  const [temporaryPassword, setTemporaryPassword] = useState(() =>
    generateTemporaryPassword(),
  );
  const [editingPermissionsRole, setEditingPermissionsRole] = useState<
    PlatformRole | ""
  >("");
  const canManageAccounts = currentUser.isOwner || currentUser.role === "admin";
  const ownerProfile = data.profiles.find(profile => profile.isOwner);
  const matchingProfiles = data.profiles.filter(profile =>
    (statusFilter === "all" || profile.accountStatus === statusFilter) &&
    (roleFilter === "all" || profile.role === roleFilter) &&
    (!accountSearch.trim() || [profile.name, profile.department, profile.jobTitle, roleNames[profile.role]]
      .join(" ").toLowerCase().includes(accountSearch.trim().toLowerCase())));
  const pageCount = Math.max(1, Math.ceil(matchingProfiles.length / 25));
  const visiblePage = Math.min(directoryPage, pageCount);
  const visibleProfiles = matchingProfiles.slice((visiblePage - 1) * 25, visiblePage * 25);
  const currentProfile = data.profiles.find(
    (item) => item.id === currentUser.id,
  );
  const canEditDirectoryProfile = (profile: PlatformProfile) =>
    canManageAccounts ||
    (currentUser.role === "department_head" &&
      Boolean(currentProfile?.departmentId) &&
      currentProfile?.departmentId === profile.departmentId);
  const editingProfile =
    data.profiles.find((profile) => profile.id === editingProfileId) ?? null;
  const rotatingProfile =
    data.profiles.find((profile) => profile.id === rotatingProfileId) ?? null;
  const profilePrograms = data.programs.filter(
    (program) => program.departmentId === profileDepartmentId,
  );
  const profileCourseIds = new Set(
    data.catalogCourses
      .filter((course) =>
        !profileProgramId
          ? course.departmentId === profileDepartmentId
          : course.programId === profileProgramId ||
            (!course.programId && course.departmentId === profileDepartmentId),
      )
      .map((course) => course.id),
  );
  const profileSections = data.courses.filter((course) =>
    profileCourseIds.has(course.courseId),
  );

  function openProfileEditor(profile: PlatformProfile) {
    setEditingProfileId(profile.id);
    setProfileDepartmentId(profile.departmentId ?? "");
    setProfileProgramId(profile.programId ?? "");
  }

  useEffect(() => {
    if (!canManageAccounts) return;
    let active = true;
    void loadAccountDirectory()
      .then((accounts) => {
        if (active) setDirectory(accounts);
      })
      .catch((error: unknown) => {
        if (active)
          setDirectoryError(
            error instanceof Error
              ? error.message
              : "Account activity could not be loaded.",
          );
      });
    return () => {
      active = false;
    };
  }, [canManageAccounts, data.profiles]);

  async function changeRole(
    profileId: string,
    role: PlatformRole,
    reason: string,
  ) {
    setChanging(profileId);
    try {
      await assignPlatformRole(profileId, role, reason);
      onToast(
        "Role updated and written to the audit trail. The user must refresh their session.",
      );
      onChanged();
      setPendingRoleChange(null);
    } catch (error) {
      onToast(
        error instanceof Error
          ? error.message
          : "The role could not be updated.",
      );
    } finally {
      setChanging("");
    }
  }

  return (
    <>
      <PageIntro
        eyebrow="ROLE HIERARCHY & GOVERNANCE"
        title="People and permissions"
        description="Every provisioned identity receives a clear school role. Supabase policies enforce access even if the interface is bypassed."
      />
      {canManageAccounts ? (
        <section className="people-provision-callout school-card">
          <div>
            <span>OWNER ACCOUNT CONTROL</span>
            <h3>Add a school account</h3>
            <p>
              Create a confirmed non-owner identity and assign its trusted role.
              The temporary password is shown here only and is never stored.
            </p>
          </div>
          <div className="people-provision-actions">
            <Button
              type="button"
              onClick={() => {
                setInviteMode(true);
                setShowProvisioner(true);
              }}
            >
              Invite by email
            </Button>
            <Button type="button" onClick={() => setShowBulkProvisioner(true)}>
              Bulk import
            </Button>
            <Button
              type="button"
              onClick={() => {
                setInviteMode(false);
                setShowProvisioner(true);
              }}
            >
              + Add account
            </Button>
          </div>
        </section>
      ) : null}
      {ownerProfile ? <section className="owner-protection">
        <span>◎</span>
        <div>
          <Pill tone="owner">PROTECTED OWNER</Pill>
          <h2>{ownerProfile.name}</h2>
          <p>
            The protected owner is the root steward. Ordinary
            administrators cannot demote, replace, or create a second owner.
          </p>
        </div>
        <b>
          100<small>authority level</small>
        </b>
      </section> : null}
      <section className="people-directory school-card">
        <header>
          <div>
            <span>{data.profiles.length} ACCOUNTS · {data.roles.length} AVAILABLE ROLES</span>
            <h3>School accounts</h3>
          </div>
        </header>
        <div className="flex flex-wrap gap-3 p-4">
          <Label className="flex-1 min-w-48">Search accounts<Input value={accountSearch} onChange={event => { setAccountSearch(event.target.value); setDirectoryPage(1); }} placeholder="Name, department or role" /></Label>
          <Label>Status<NativeSelect value={statusFilter} onChange={event => { setStatusFilter(event.target.value); setDirectoryPage(1); }}>
            <NativeSelectOption value="active">Active</NativeSelectOption><NativeSelectOption value="suspended">Suspended</NativeSelectOption><NativeSelectOption value="archived">Archived</NativeSelectOption><NativeSelectOption value="all">All statuses</NativeSelectOption>
          </NativeSelect></Label>
          <Label>Role<NativeSelect value={roleFilter} onChange={event => { setRoleFilter(event.target.value); setDirectoryPage(1); }}><NativeSelectOption value="all">All roles</NativeSelectOption>{data.roles.map(role => <NativeSelectOption key={role.code} value={role.code}>{role.name}</NativeSelectOption>)}</NativeSelect></Label>
        </div>
        {visibleProfiles.length === 0 ? <p className="p-4" role="status">No accounts match these filters.</p> : null}
        {visibleProfiles.map((profile) => (
          <div
            key={profile.id}
            className={managingProfileId === profile.id ? "selected" : ""}
          >
            <span>
              {profile.name
                .split(/\s+/)
                .slice(0, 2)
                .map((item) => item[0])
                .join("")}
            </span>
            <p>
              <b>{profile.name}</b>
              <small>
                {profile.jobTitle ||
                  profile.department ||
                  roleNames[profile.role]}
              </small>
              {currentUser.isOwner ? (
                <small>
                  Last sign-in:{" "}
                  {directory.find((item) => item.id === profile.id)
                    ?.lastSignInAt
                    ? formatMoment(
                        directory.find((item) => item.id === profile.id)!
                          .lastSignInAt!,
                      )
                    : "Never"}
                </small>
              ) : null}
              <small>
                Responsibilities:{" "}
                {[
                  data.departments.find(
                    (item) => item.id === profile.departmentId,
                  )?.code,
                  data.programs.find((item) => item.id === profile.programId)
                    ?.code,
                  ...data.sectionAssignments
                    .filter((item) => item.profileId === profile.id)
                    .map((item) => {
                      const course = data.courses.find(
                        (courseItem) => courseItem.sectionId === item.sectionId,
                      );
                      return course
                        ? `${course.code} (${item.responsibility})`
                        : item.responsibility;
                    }),
                  ...data.students
                    .filter((student) => student.advisorId === profile.id)
                    .map((student) => `Advisee: ${student.name}`),
                ]
                  .filter(Boolean)
                  .join(" · ") || "No assigned responsibilities"}
              </small>
            </p>
            {profile.isOwner ? (
              <Pill tone="owner">Protected owner</Pill>
            ) : canManageAccounts && managingProfileId === profile.id ? (
              <div className="people-account-controls">
                <Pill
                  tone={profile.accountStatus === "active" ? "green" : "amber"}
                >
                  {profile.accountStatus}
                </Pill>
                <NativeSelect
                  value={profile.role}
                  disabled={changing === profile.id}
                  onChange={(event) =>
                    setPendingRoleChange({
                      profileId: profile.id,
                      previousRole: profile.role,
                      nextRole: event.target.value as PlatformRole,
                    })
                  }
                >
                  {data.roles
                    .filter((role) => role.code !== "owner")
                    .map((role) => (
                      <NativeSelectOption key={role.code} value={role.code}>
                        {role.name}
                      </NativeSelectOption>
                    ))}
                </NativeSelect>
                <Button
                  type="button"
                  onClick={() =>
                    setPendingLifecycle({
                      profileId: profile.id,
                      action:
                        profile.accountStatus === "active"
                          ? "suspend"
                          : profile.accountStatus === "archived"
                            ? "restore"
                            : "activate",
                    })
                  }
                >
                  {profile.accountStatus === "active"
                    ? "Suspend"
                    : profile.accountStatus === "archived"
                      ? "Restore"
                      : "Activate"}
                </Button>
                {profile.accountStatus !== "archived" ? (
                  <Button
                    type="button"
                    onClick={() =>
                      setPendingLifecycle({
                        profileId: profile.id,
                        action: "archive",
                      })
                    }
                  >
                    Archive
                  </Button>
                ) : null}
                <Button
                  type="button"
                  onClick={() => setRotatingProfileId(profile.id)}
                >
                  Reset password
                </Button>
                <Button
                  type="button"
                  onClick={() => setPendingSessionRevoke(profile.id)}
                >
                  Revoke sessions
                </Button>
                {(() => {
                  const account = directory.find(
                    (item) => item.id === profile.id,
                  );
                  return account?.invitedAt && !account.confirmedAt ? (
                    <Button
                      type="button"
                      onClick={() => {
                        setChanging(profile.id);
                        void resendRoleInvitation(account.email)
                          .then(() =>
                            onToast("Institutional invitation resent."),
                          )
                          .catch((error: unknown) =>
                            onToast(
                              error instanceof Error
                                ? error.message
                                : "Invitation resend failed.",
                            ),
                          )
                          .finally(() => setChanging(""));
                      }}
                    >
                      Resend invite
                    </Button>
                  ) : null;
                })()}
                <Button type="button" onClick={() => setManagingProfileId("")}>
                  Close actions
                </Button>
              </div>
            ) : canManageAccounts ? (
              <Button
                type="button"
                className="people-manage-account"
                onClick={() => setManagingProfileId(profile.id)}
                aria-expanded={false}
              >
                Manage account →
              </Button>
            ) : (
              <Pill tone="teal">{roleNames[profile.role]}</Pill>
            )}
            {canEditDirectoryProfile(profile) &&
            (!canManageAccounts || managingProfileId === profile.id) ? (
              <Button type="button" onClick={() => openProfileEditor(profile)}>
                Edit identity
              </Button>
            ) : null}
          </div>
        ))}
      </section>
      <div className="flex items-center gap-3 py-3" aria-label="Account pages">
        <Button disabled={visiblePage === 1} onClick={() => setDirectoryPage(visiblePage - 1)}>Previous accounts</Button>
        <span role="status">{matchingProfiles.length} matching accounts · Page {visiblePage} of {pageCount}</span>
        <Button disabled={visiblePage === pageCount} onClick={() => setDirectoryPage(visiblePage + 1)}>Next accounts</Button>
      </div>
      {directoryError ? (
        <div className="school-inline-error" role="alert">
          {directoryError}
        </div>
      ) : null}
      {canManageAccounts ? (
        <section className="people-audit school-card">
          <header>
            <div>
              <span>IMMUTABLE GOVERNANCE EVIDENCE</span>
              <h3>Recent account and role activity</h3>
            </div>
            <Button type="button" onClick={exportGovernanceAudit}>
              Export audit CSV
            </Button>
          </header>
          {[...data.accountAudits, ...data.roleAudits, ...data.accessAudits]
            .sort((left, right) =>
              right.createdAt.localeCompare(left.createdAt),
            )
            .slice(0, 20)
            .map((entry) => {
              const target = data.profiles.find(
                (profile) => profile.id === entry.targetProfileId,
              );
              const actor = data.profiles.find(
                (profile) => profile.id === entry.changedBy,
              );
              const transition =
                "action" in entry
                  ? entry.action
                  : "newStatus" in entry
                    ? `${entry.previousStatus} → ${entry.newStatus}`
                    : `${entry.previousRole} → ${entry.newRole}`;
              return (
                <Card key={entry.id}>
                  <div>
                    <b>{target?.name ?? "Account"}</b>
                    <span>{transition.replaceAll("_", " ")}</span>
                  </div>
                  <p>{entry.reason}</p>
                  <small>
                    {actor?.name ?? "Authorized operator"} ·{" "}
                    {new Intl.DateTimeFormat("en", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    }).format(new Date(entry.createdAt))}
                  </small>
                </Card>
              );
            })}
          {!data.accountAudits.length &&
          !data.roleAudits.length &&
          !data.accessAudits.length ? (
            <div className="school-empty-state">
              No account or role changes have been recorded.
            </div>
          ) : null}
        </section>
      ) : null}
      {canManageAccounts ? (
        <section className="school-card governance-boundary">
          <span>RETENTION SAFEGUARD</span>
          <h3>Permanent deletion is disabled</h3>
          <p>
            Institutional identities and records with academic, support,
            communication, or audit history must be archived or transitioned
            through a reasoned controlled workflow. Destructive deletion is not
            exposed.
          </p>
        </section>
      ) : null}
      <details className="school-card p-5">
        <summary className="cursor-pointer font-semibold">Advanced role permissions ({data.roles.length} role templates)</summary>
        <p className="py-3">These are permission templates, not additional user accounts. Existing access rules remain enforced by the database.</p>
      <section className="role-hierarchy">
        {["ownership", "leadership", "academic", "operations", "learner"].map(
          (category) => (
            <div key={category}>
              <header>{category}</header>
              {data.roles
                .filter((role) => role.category === category)
                .map((role) => (
                  <Card key={role.code}>
                    <span>{role.level}</span>
                    <div>
                      <h3>{role.name}</h3>
                      <p>{role.description}</p>
                      <div>
                        {role.capabilities.map((item) => (
                          <small key={item}>{item.replaceAll("_", " ")}</small>
                        ))}
                      </div>
                    </div>
                    <b>
                      {
                        data.profiles.filter(
                          (profile) => profile.role === role.code,
                        ).length
                      }
                      <small>assigned</small>
                    </b>
                    {currentUser.isOwner && role.code !== "owner" ? (
                      <Button
                        type="button"
                        onClick={() => setEditingPermissionsRole(role.code)}
                      >
                        Configure permissions
                      </Button>
                    ) : null}
                  </Card>
                ))}
            </div>
          ),
        )}
      </section>
      </details>
      {editingPermissionsRole
        ? (() => {
            const definition = data.roles.find(
              (item) => item.code === editingPermissionsRole,
            );
            if (!definition || definition.code === "owner") return null;
            const catalog = [
              ...new Set(data.roles.flatMap((item) => item.capabilities)),
            ].sort();
            return (
              <Dialog
                open
                onOpenChange={(open) => {
                  if (!open) (() => setEditingPermissionsRole(""))();
                }}
              >
                <DialogContent
                  showCloseButton={false}
                  className="academic-modal role-capability-modal max-h-[90dvh] overflow-y-auto sm:max-w-4xl"
                  role="dialog"
                  aria-modal="true"
                  aria-label="Configure role permissions"
                >
                  <DialogDescription className="sr-only">
                    Review the details and submit to save your changes.
                  </DialogDescription>
                  <header>
                    <div>
                      <span>OWNER POLICY CONTROL</span>
                      <DialogTitle asChild>
                        <h2>Configure {definition.name}</h2>
                      </DialogTitle>
                      <p>
                        Choose governed capabilities from the institutional
                        catalog. No formatting or memorized policy codes
                        required.
                      </p>
                    </div>
                    <Button
                      type="button"
                      onClick={() => setEditingPermissionsRole("")}
                    >
                      ×
                    </Button>
                  </header>
                  <RoleCapabilityPicker
                    key={definition.code}
                    roleCode={definition.code}
                    initialCapabilities={definition.capabilities}
                    catalog={catalog}
                    onCancel={() => setEditingPermissionsRole("")}
                    onSaved={() => {
                      setEditingPermissionsRole("");
                      onChanged();
                    }}
                    onToast={onToast}
                  />
                </DialogContent>
              </Dialog>
            );
          })()
        : null}
      {showProvisioner ? (
        <Dialog
          open
          onOpenChange={(open) => {
            if (!open) (() => setShowProvisioner(false))();
          }}
        >
          <DialogContent
            showCloseButton={false}
            className="academic-modal max-h-[90dvh] overflow-y-auto sm:max-w-4xl"
            role="dialog"
            aria-modal="true"
            aria-label="Add school account"
          >
            <DialogDescription className="sr-only">
              Review the details and submit to save your changes.
            </DialogDescription>
            <header>
              <div>
                <span>PEOPLE & PERMISSIONS</span>
                <DialogTitle asChild>
                  <h2>
                    {inviteMode
                      ? "Invite school account"
                      : "Add school account"}
                  </h2>
                </DialogTitle>
                <p>
                  {inviteMode
                    ? "Send a secure institutional invitation. The recipient chooses their password."
                    : "Create or securely rotate a confirmed non-owner identity."}
                </p>
              </div>
              <Button type="button" onClick={() => setShowProvisioner(false)}>
                ×
              </Button>
            </header>
            <form
              className="academic-form"
              onSubmit={(event) => {
                event.preventDefault();
                const form = new FormData(event.currentTarget);
                setProvisioning(true);
                const accountInput = {
                  fullName: String(form.get("fullName")),
                  email: String(form.get("email")),
                  role: String(form.get("role")) as Exclude<
                    PlatformRole,
                    "owner"
                  >,
                };
                void (
                  inviteMode
                    ? inviteRoleAccount(accountInput)
                    : provisionRoleAccount({
                        ...accountInput,
                        password: temporaryPassword,
                      })
                )
                  .then((result) => {
                    onToast(
                      result.status === "invited"
                        ? "Invitation sent. The recipient can choose a password securely."
                        : result.status === "created"
                          ? "Account created. Copy the temporary password before closing."
                          : "Existing account credentials and role were securely updated.",
                    );
                    onChanged();
                  })
                  .catch((error: unknown) =>
                    onToast(
                      error instanceof Error
                        ? error.message
                        : "Account creation failed.",
                    ),
                  )
                  .finally(() => setProvisioning(false));
              }}
            >
              <div className="academic-form-grid">
                <Label>
                  <span>Full name</span>
                  <Input name="fullName" required maxLength={120} />
                </Label>
                {!inviteMode ? (
                  <Label>
                    <span>School email</span>
                    <Input name="email" type="email" required maxLength={254} />
                  </Label>
                ) : null}
                <Label>
                  <span>Role</span>
                  <NativeSelect name="role" required defaultValue="faculty">
                    {data.roles
                      .filter((item) => item.code !== "owner")
                      .map((item) => (
                        <NativeSelectOption key={item.code} value={item.code}>
                          {item.name}
                        </NativeSelectOption>
                      ))}
                  </NativeSelect>
                </Label>
                <Label>
                  <span>Temporary password</span>
                  <div className="password-generator-field">
                    <Input value={temporaryPassword} readOnly />
                    <Button
                      type="button"
                      onClick={() =>
                        setTemporaryPassword(generateTemporaryPassword())
                      }
                    >
                      Regenerate
                    </Button>
                  </div>
                </Label>
              </div>
              <footer>
                <span>Only the protected owner can perform this action.</span>
                <Button disabled={provisioning}>
                  {provisioning
                    ? "Working…"
                    : inviteMode
                      ? "Send invitation"
                      : "Create account"}
                </Button>
              </footer>
            </form>
          </DialogContent>
        </Dialog>
      ) : null}
      {showBulkProvisioner ? (
        <Dialog
          open
          onOpenChange={(open) => {
            if (!open) (() => setShowBulkProvisioner(false))();
          }}
        >
          <DialogContent
            showCloseButton={false}
            className="academic-modal max-h-[90dvh] overflow-y-auto sm:max-w-4xl"
            role="dialog"
            aria-modal="true"
            aria-label="Bulk import accounts"
          >
            <DialogDescription className="sr-only">
              Review the details and submit to save your changes.
            </DialogDescription>
            <header>
              <div>
                <span>CONTROLLED BULK PROVISIONING</span>
                <DialogTitle asChild>
                  <h2>Bulk import school accounts</h2>
                </DialogTitle>
                <p>
                  One account per line: full name, email, role, optional
                  temporary password. Maximum 100.
                </p>
              </div>
              <Button
                type="button"
                onClick={() => setShowBulkProvisioner(false)}
              >
                ×
              </Button>
            </header>
            <form
              className="academic-form"
              onSubmit={(event) => {
                event.preventDefault();
                const allowed = new Set(
                  data.roles
                    .filter((item) => item.code !== "owner")
                    .map((item) => item.code),
                );
                const rows = bulkAccounts
                  .split(/\r?\n/)
                  .map((line) => line.trim())
                  .filter(Boolean);
                if (!rows.length || rows.length > 100) {
                  onToast("Enter between 1 and 100 account rows.");
                  return;
                }
                setProvisioning(true);
                void (async () => {
                  const completed: string[] = [];
                  for (const [index, row] of rows.entries()) {
                    const [
                      fullName = "",
                      email = "",
                      role = "",
                      suppliedPassword = "",
                    ] = row.split(",").map((value) => value.trim());
                    if (
                      !fullName ||
                      !email ||
                      !allowed.has(role as PlatformRole)
                    )
                      throw new Error(
                        `Row ${index + 1} has an invalid name, email, or role.`,
                      );
                    const password =
                      suppliedPassword || generateTemporaryPassword();
                    await provisionRoleAccount({
                      fullName,
                      email,
                      role: role as Exclude<PlatformRole, "owner">,
                      password,
                    });
                    completed.push(`${fullName},${email},${role},${password}`);
                  }
                  setBulkResults(completed.join("\n"));
                  onToast(
                    `${completed.length} accounts were provisioned. Copy the one-time credentials now.`,
                  );
                  onChanged();
                })()
                  .catch((error: unknown) =>
                    onToast(
                      error instanceof Error
                        ? error.message
                        : "Bulk provisioning failed.",
                    ),
                  )
                  .finally(() => setProvisioning(false));
              }}
            >
              <Label>
                <span>Account rows</span>
                <Textarea
                  rows={8}
                  value={bulkAccounts}
                  onChange={(event) => setBulkAccounts(event.target.value)}
                  placeholder="Maria Santos,maria@example.edu,faculty"
                  required
                />
              </Label>
              {bulkResults ? (
                <Label>
                  <span>One-time credentials — copy before closing</span>
                  <Textarea rows={8} value={bulkResults} readOnly />
                </Label>
              ) : null}
              <footer>
                <span>
                  Passwords are displayed once and are never stored in the
                  application database.
                </span>
                <Button disabled={provisioning}>
                  {provisioning ? "Provisioning…" : "Import accounts"}
                </Button>
              </footer>
            </form>
          </DialogContent>
        </Dialog>
      ) : null}
      {rotatingProfile ? (
        <Dialog
          open
          onOpenChange={(open) => {
            if (!open) (() => setRotatingProfileId(""))();
          }}
        >
          <DialogContent
            showCloseButton={false}
            className="academic-modal max-h-[90dvh] overflow-y-auto sm:max-w-4xl"
            role="dialog"
            aria-modal="true"
            aria-label="Reset temporary password"
          >
            <DialogDescription className="sr-only">
              Review the details and submit to save your changes.
            </DialogDescription>
            <header>
              <div>
                <span>CREDENTIAL ROTATION</span>
                <DialogTitle asChild>
                  <h2>Reset {rotatingProfile.name}’s password</h2>
                </DialogTitle>
                <p>The new temporary password is shown only in this dialog.</p>
              </div>
              <Button type="button" onClick={() => setRotatingProfileId("")}>
                ×
              </Button>
            </header>
            <form
              className="academic-form"
              onSubmit={(event) => {
                event.preventDefault();
                const authAccount = directory.find(
                  (item) => item.id === rotatingProfile.id,
                );
                if (!authAccount?.email) {
                  onToast("The Auth email is unavailable.");
                  return;
                }
                setProvisioning(true);
                void provisionRoleAccount({
                  email: authAccount.email,
                  password: temporaryPassword,
                  role: rotatingProfile.role as Exclude<PlatformRole, "owner">,
                  fullName: rotatingProfile.name,
                })
                  .then(() => {
                    onToast(
                      "Temporary credentials rotated and audited. Copy the password before closing.",
                    );
                    onChanged();
                  })
                  .catch((error: unknown) =>
                    onToast(
                      error instanceof Error
                        ? error.message
                        : "Credential rotation failed.",
                    ),
                  )
                  .finally(() => setProvisioning(false));
              }}
            >
              <Label>
                <span>New temporary password</span>
                <div className="password-generator-field">
                  <Input value={temporaryPassword} readOnly />
                  <Button
                    type="button"
                    onClick={() =>
                      setTemporaryPassword(generateTemporaryPassword())
                    }
                  >
                    Regenerate
                  </Button>
                </div>
              </Label>
              <footer>
                <span>Existing credentials will stop working immediately.</span>
                <Button disabled={provisioning}>
                  {provisioning ? "Rotating…" : "Rotate credentials"}
                </Button>
              </footer>
            </form>
          </DialogContent>
        </Dialog>
      ) : null}
      {pendingSessionRevoke
        ? (() => {
            const profile = data.profiles.find(
              (item) => item.id === pendingSessionRevoke,
            );
            if (!profile) return null;
            return (
              <Dialog
                open
                onOpenChange={(open) => {
                  if (!open) (() => setPendingSessionRevoke(""))();
                }}
              >
                <DialogContent
                  showCloseButton={false}
                  className="academic-modal max-h-[90dvh] overflow-y-auto sm:max-w-4xl"
                  role="dialog"
                  aria-modal="true"
                  aria-label="Revoke account sessions"
                >
                  <DialogDescription className="sr-only">
                    Review the details and submit to save your changes.
                  </DialogDescription>
                  <header>
                    <div>
                      <span>ACCESS CONTROL</span>
                      <DialogTitle asChild>
                        <h2>Revoke {profile.name}’s sessions?</h2>
                      </DialogTitle>
                      <p>
                        Refresh sessions will be removed immediately.
                        Short-lived access tokens expire at the configured JWT
                        boundary.
                      </p>
                    </div>
                    <Button
                      type="button"
                      onClick={() => setPendingSessionRevoke("")}
                    >
                      ×
                    </Button>
                  </header>
                  <form
                    className="academic-form"
                    onSubmit={(event) => {
                      event.preventDefault();
                      const reason = String(
                        new FormData(event.currentTarget).get("reason"),
                      );
                      setChanging(profile.id);
                      void revokeAccountSessions({
                        targetId: profile.id,
                        reason,
                      })
                        .then((result) => {
                          onToast(
                            `${result.revokedCount} active session records revoked and audited.`,
                          );
                          setPendingSessionRevoke("");
                        })
                        .catch((error: unknown) =>
                          onToast(
                            error instanceof Error
                              ? error.message
                              : "Session revocation failed.",
                          ),
                        )
                        .finally(() => setChanging(""));
                    }}
                  >
                    <Label>
                      <span>Reason</span>
                      <Textarea
                        name="reason"
                        minLength={12}
                        maxLength={500}
                        rows={4}
                        required
                      />
                    </Label>
                    <footer>
                      <span>This cannot target the protected owner.</span>
                      <Button disabled={changing === profile.id}>
                        {changing === profile.id
                          ? "Revoking…"
                          : "Revoke sessions"}
                      </Button>
                    </footer>
                  </form>
                </DialogContent>
              </Dialog>
            );
          })()
        : null}
      {pendingRoleChange
        ? (() => {
            const profile = data.profiles.find(
              (item) => item.id === pendingRoleChange.profileId,
            );
            if (!profile) return null;
            return (
              <Dialog
                open
                onOpenChange={(open) => {
                  if (!open) (() => setPendingRoleChange(null))();
                }}
              >
                <DialogContent
                  showCloseButton={false}
                  className="academic-modal max-h-[90dvh] overflow-y-auto sm:max-w-4xl"
                  role="dialog"
                  aria-modal="true"
                  aria-label="Confirm role change"
                >
                  <DialogDescription className="sr-only">
                    Review the details and submit to save your changes.
                  </DialogDescription>
                  <header>
                    <div>
                      <span>CONTROLLED ROLE TRANSITION</span>
                      <DialogTitle asChild>
                        <h2>Change {profile.name}’s role?</h2>
                      </DialogTitle>
                      <p>
                        {roleNames[pendingRoleChange.previousRole]} →{" "}
                        {roleNames[pendingRoleChange.nextRole]}. Their current
                        session must refresh before the new authorization takes
                        effect.
                      </p>
                    </div>
                    <Button
                      type="button"
                      onClick={() => setPendingRoleChange(null)}
                    >
                      ×
                    </Button>
                  </header>
                  <form
                    className="academic-form"
                    onSubmit={(event) => {
                      event.preventDefault();
                      const form = new FormData(event.currentTarget);
                      void changeRole(
                        pendingRoleChange.profileId,
                        pendingRoleChange.nextRole,
                        String(form.get("reason")),
                      );
                    }}
                  >
                    <Label>
                      <span>Reason for this authorization change</span>
                      <Textarea
                        name="reason"
                        required
                        minLength={12}
                        maxLength={500}
                        rows={4}
                        placeholder="Describe the approved responsibility or staffing change."
                      />
                    </Label>
                    <footer>
                      <span>
                        An immutable role-audit entry will be written.
                      </span>
                      <Button disabled={changing === profile.id}>
                        {changing === profile.id
                          ? "Applying…"
                          : "Confirm role change"}
                      </Button>
                    </footer>
                  </form>
                </DialogContent>
              </Dialog>
            );
          })()
        : null}
      {pendingLifecycle
        ? (() => {
            const profile = data.profiles.find(
              (item) => item.id === pendingLifecycle.profileId,
            );
            if (!profile) return null;
            return (
              <Dialog
                open
                onOpenChange={(open) => {
                  if (!open) (() => setPendingLifecycle(null))();
                }}
              >
                <DialogContent
                  showCloseButton={false}
                  className="academic-modal max-h-[90dvh] overflow-y-auto sm:max-w-4xl"
                  role="dialog"
                  aria-modal="true"
                  aria-label="Confirm account lifecycle change"
                >
                  <DialogDescription className="sr-only">
                    Review the details and submit to save your changes.
                  </DialogDescription>
                  <header>
                    <div>
                      <span>ACCOUNT LIFECYCLE</span>
                      <DialogTitle asChild>
                        <h2>
                          {pendingLifecycle.action} {profile.name}’s account?
                        </h2>
                      </DialogTitle>
                      <p>
                        Suspended and archived identities are blocked from new
                        Auth sessions. Existing access expires according to the
                        configured JWT lifetime.
                      </p>
                    </div>
                    <Button
                      type="button"
                      onClick={() => setPendingLifecycle(null)}
                    >
                      ×
                    </Button>
                  </header>
                  <form
                    className="academic-form"
                    onSubmit={(event) => {
                      event.preventDefault();
                      const form = new FormData(event.currentTarget);
                      setChanging(profile.id);
                      void changeAccountLifecycle({
                        targetId: profile.id,
                        action: pendingLifecycle.action,
                        reason: String(form.get("reason")),
                      })
                        .then(() => {
                          onToast("Account lifecycle updated and audited.");
                          setPendingLifecycle(null);
                          onChanged();
                        })
                        .catch((error: unknown) =>
                          onToast(
                            error instanceof Error
                              ? error.message
                              : "Account lifecycle change failed.",
                          ),
                        )
                        .finally(() => setChanging(""));
                    }}
                  >
                    <Label>
                      <span>Reason</span>
                      <Textarea
                        name="reason"
                        required
                        minLength={12}
                        maxLength={500}
                        rows={4}
                      />
                    </Label>
                    <footer>
                      <span>
                        This action writes immutable lifecycle evidence.
                      </span>
                      <Button disabled={changing === profile.id}>
                        {changing === profile.id
                          ? "Applying…"
                          : `Confirm ${pendingLifecycle.action}`}
                      </Button>
                    </footer>
                  </form>
                </DialogContent>
              </Dialog>
            );
          })()
        : null}
      {editingProfile ? (
        <Dialog
          open
          onOpenChange={(open) => {
            if (!open) (() => setEditingProfileId(""))();
          }}
        >
          <DialogContent
            showCloseButton={false}
            className="academic-modal max-h-[90dvh] overflow-y-auto sm:max-w-4xl"
            role="dialog"
            aria-modal="true"
            aria-label="Edit profile"
          >
            <DialogDescription className="sr-only">
              Review the details and submit to save your changes.
            </DialogDescription>
            <header>
              <div>
                <span>PEOPLE & PERMISSIONS</span>
                <DialogTitle asChild>
                  <h2>Edit {editingProfile.name}</h2>
                </DialogTitle>
                <p>
                  Update directory information. Trusted role changes remain a
                  separate audited action.
                </p>
              </div>
              <Button type="button" onClick={() => setEditingProfileId("")}>
                ×
              </Button>
            </header>
            <form
              className="academic-form"
              onSubmit={(event) => {
                event.preventDefault();
                const f = new FormData(event.currentTarget);
                setChanging(editingProfile.id);
                const operations = canManageAccounts
                  ? [
                      updatePlatformProfile(editingProfile.id, {
                        fullName: String(f.get("fullName")),
                        department:
                          data.departments.find(
                            (item) => item.id === profileDepartmentId,
                          )?.name ?? editingProfile.department,
                        jobTitle: String(f.get("jobTitle")),
                      }),
                      updateAccountIdentity({
                        targetId: editingProfile.id,
                        email: String(f.get("email")),
                        phone: String(f.get("accountPhone")),
                        reason: String(f.get("assignmentReason")),
                      }),
                      assignProfileResponsibilities({
                        profileId: editingProfile.id,
                        departmentId: String(f.get("departmentId")) || null,
                        programId: String(f.get("programId")) || null,
                        sectionId: String(f.get("sectionId")) || null,
                        responsibility: String(f.get("responsibility")) as
                          "faculty" | "assistant" | "coordinator" | "observer",
                        reason: String(f.get("assignmentReason")),
                      }),
                    ]
                  : [
                      updateDepartmentStaffProfile({
                        profileId: editingProfile.id,
                        fullName: String(f.get("fullName")),
                        department: editingProfile.department,
                        jobTitle: String(f.get("jobTitle")),
                        reason: String(f.get("assignmentReason")),
                      }),
                    ];
                void Promise.all(operations)
                  .then(() => {
                    onToast("Profile updated.");
                    setEditingProfileId("");
                    onChanged();
                  })
                  .catch((error: unknown) =>
                    onToast(
                      error instanceof Error
                        ? error.message
                        : "Profile update failed.",
                    ),
                  )
                  .finally(() => setChanging(""));
              }}
            >
              <div className="academic-form-grid">
                <Label>
                  <span>Full name</span>
                  <Input
                    name="fullName"
                    required
                    defaultValue={editingProfile.name}
                  />
                </Label>
                <Label>
                  <span>Department</span>
                  <Input
                    value={
                      data.departments.find(
                        (item) => item.id === profileDepartmentId,
                      )?.name ??
                      editingProfile.department ??
                      "No department assignment"
                    }
                    disabled
                  />
                </Label>
                {canManageAccounts ? (
                  <>
                    <Label>
                      <span>Account email</span>
                      <Input
                        name="email"
                        type="email"
                        required
                        defaultValue={
                          directory.find(
                            (item) => item.id === editingProfile.id,
                          )?.email ?? ""
                        }
                      />
                    </Label>
                    <Label>
                      <span>Phone</span>
                      <Input
                        name="accountPhone"
                        maxLength={40}
                        defaultValue={editingProfile.phone}
                      />
                    </Label>
                    <Label>
                      <span>Assigned department</span>
                      <NativeSelect
                        name="departmentId"
                        value={profileDepartmentId}
                        onChange={(event) => {
                          setProfileDepartmentId(event.target.value);
                          setProfileProgramId("");
                        }}
                      >
                        <NativeSelectOption value="">
                          No department assignment
                        </NativeSelectOption>
                        {data.departments.map((item) => (
                          <NativeSelectOption key={item.id} value={item.id}>
                            {item.code} · {item.name}
                          </NativeSelectOption>
                        ))}
                      </NativeSelect>
                    </Label>
                    <Label>
                      <span>Assigned program</span>
                      <NativeSelect
                        name="programId"
                        value={profileProgramId}
                        disabled={!profileDepartmentId}
                        onChange={(event) =>
                          setProfileProgramId(event.target.value)
                        }
                      >
                        <NativeSelectOption value="">
                          No program assignment
                        </NativeSelectOption>
                        {profilePrograms.map((item) => (
                          <NativeSelectOption key={item.id} value={item.id}>
                            {item.code} · {item.name}
                          </NativeSelectOption>
                        ))}
                      </NativeSelect>
                    </Label>
                    <Label>
                      <span>Class responsibility</span>
                      <NativeSelect
                        name="sectionId"
                        defaultValue=""
                        disabled={!profileDepartmentId}
                      >
                        <NativeSelectOption value="">
                          No new class assignment
                        </NativeSelectOption>
                        {profileSections.map((item) => (
                          <NativeSelectOption
                            key={item.sectionId}
                            value={item.sectionId}
                          >
                            {item.code} · {item.sectionCode} · {item.term}
                          </NativeSelectOption>
                        ))}
                      </NativeSelect>
                    </Label>
                    <Label>
                      <span>Class responsibility type</span>
                      <NativeSelect
                        name="responsibility"
                        defaultValue="faculty"
                      >
                        <NativeSelectOption value="faculty">
                          Faculty
                        </NativeSelectOption>
                        <NativeSelectOption value="assistant">
                          Teaching assistant
                        </NativeSelectOption>
                        <NativeSelectOption value="coordinator">
                          Coordinator
                        </NativeSelectOption>
                        <NativeSelectOption value="observer">
                          Observer
                        </NativeSelectOption>
                      </NativeSelect>
                    </Label>
                  </>
                ) : null}
                <Label className="academic-form-wide">
                  <span>Assignment reason</span>
                  <Textarea
                    name="assignmentReason"
                    minLength={12}
                    maxLength={500}
                    rows={3}
                    required
                    defaultValue="Authorized directory and responsibility update."
                  />
                </Label>
                <Label>
                  <span>Job title</span>
                  <Input
                    name="jobTitle"
                    defaultValue={editingProfile.jobTitle}
                  />
                </Label>
              </div>
              <footer>
                <span>Authorization is not changed by this form.</span>
                <Button disabled={changing === editingProfile.id}>
                  {changing ? "Saving…" : "Save profile changes"}
                </Button>
              </footer>
              {data.sectionAssignments
                .filter((item) => item.profileId === editingProfile.id)
                .map((assignment) => (
                  <div key={assignment.id} className="school-inline-governance">
                    <span>
                      {data.courses.find(
                        (course) => course.sectionId === assignment.sectionId,
                      )?.code ?? "Class"}{" "}
                      · {assignment.responsibility}
                    </span>
                    <Button
                      type="button"
                      onClick={async () => {
                        const reason = await requestText(
                          "Reason for removing this responsibility (at least 12 characters)",
                        );
                        if (!reason) return;
                        void removeProfileSectionAssignment(
                          assignment.id,
                          reason,
                        )
                          .then(() => {
                            onToast(
                              "Responsibility removed with immutable evidence.",
                            );
                            onChanged();
                          })
                          .catch((error: unknown) =>
                            onToast(
                              error instanceof Error
                                ? error.message
                                : "Responsibility removal failed.",
                            ),
                          );
                      }}
                    >
                      Remove responsibility
                    </Button>
                  </div>
                ))}
            </form>
          </DialogContent>
        </Dialog>
      ) : null}
    </>
  );
}
