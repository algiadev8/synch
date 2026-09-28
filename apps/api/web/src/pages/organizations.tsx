import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type SubmitEvent,
} from "react";
import { Brand, Field, Status, type StatusValue } from "../components/common";
import { errorMessage, getSession, request, type User } from "../lib/api";
import { localUrl, signIn } from "../lib/navigation";
import {
  canManage,
  organizationPath,
  type Organization,
  type OrganizationSummary,
  type Role,
} from "../lib/organizations";
import type { PageProps, Translator } from "../lib/i18n";

type Action = () => Promise<unknown>;
interface ManagementProps {
  organization: Organization;
  busy: boolean;
  t: Translator<"organizations">;
  perform: (action: Action) => Promise<void>;
  api: <T = unknown>(
    suffix: string,
    method: string,
    body?: unknown,
  ) => Promise<T>;
}
export function OrganizationsPage({ t, locale }: PageProps<"organizations">) {
  const [organizations, setOrganizations] = useState<OrganizationSummary[]>([]);
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [inviteUrl, setInviteUrl] = useState("");
  const [busy, setBusy] = useState(true);
  const lock = useRef(false);
  const [status, setStatus] = useState<StatusValue>({ message: "…" });

  function applyOrganization(detail: Organization) {
    if (!canManage(detail)) {
      setOrganization(null);
      location.replace(localUrl("/vaults", locale));
      return;
    }
    setOrganization(detail);
    setOrganizations((items) =>
      items.map((item) =>
        item.id === detail.id ? { ...item, name: detail.name } : item,
      ),
    );
    const url = new URL(location.href);
    url.searchParams.set("organizationId", detail.id);
    history.replaceState(null, "", url);
  }
  useEffect(() => {
    const controller = new AbortController();
    async function initialize() {
      try {
        const session = await getSession(t("failed"), controller.signal);
        if (controller.signal.aborted) return;
        if (!session?.user) {
          signIn(locale);
          return;
        }
        setUser(session.user);
        const result = await request<{ organizations: OrganizationSummary[] }>(
          "/v1/organizations",
          { fallback: t("failed"), signal: controller.signal },
        );
        if (controller.signal.aborted) return;
        const visible = result.organizations.filter(canManage);
        if (!visible.length) {
          location.replace(localUrl("/vaults", locale));
          return;
        }
        setOrganizations(visible);
        const requested = new URLSearchParams(location.search).get(
          "organizationId",
        );
        const id =
          visible.find((item) => item.id === requested)?.id ?? visible[0].id;
        setSelectedId(id);
        const detail = await request<Organization>(organizationPath(id), {
          fallback: t("failed"),
          signal: controller.signal,
        });
        if (!controller.signal.aborted) {
          applyOrganization(detail);
          setStatus({ message: "" });
        }
      } catch (error) {
        if (!controller.signal.aborted)
          setStatus({
            message: errorMessage(error, t("failed")),
            tone: "error",
          });
      } finally {
        if (!controller.signal.aborted) setBusy(false);
      }
    }
    void initialize();
    return () => controller.abort();
  }, [t, locale]);

  async function perform(action: Action, id = selectedId) {
    if (lock.current || busy) return;
    lock.current = true;
    setBusy(true);
    setStatus({ message: t("working") });
    try {
      const message = await action();
      const detail = await request<Organization>(organizationPath(id), {
        fallback: t("failed"),
      });
      applyOrganization(detail);
      setStatus({
        message: typeof message === "string" ? message : t("saved"),
      });
    } catch (error) {
      setStatus({ message: errorMessage(error, t("failed")), tone: "error" });
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  function api<T = unknown>(suffix: string, method: string, body?: unknown) {
    return request<T>(organizationPath(selectedId, suffix), {
      method,
      body,
      fallback: t("failed"),
    });
  }
  const props: ManagementProps | null = organization
    ? { organization, busy, t, perform, api }
    : null;
  let billingUrl = organization?.billingUrl;
  if (billingUrl) {
    const url = new URL(billingUrl);
    if (locale !== "en") url.pathname = `/${locale}/billing`;
    billingUrl = url.toString();
  }
  return (
    <main className="page page--wide organization-page">
      <div className="topbar organization-topbar">
        <Brand />
        <a
          id="vaults-link"
          href={localUrl(
            "/vaults",
            locale,
            selectedId ? { organizationId: selectedId } : {},
          )}
        >
          {t("vaults")}
        </a>
      </div>
      {organization && (
        <header id="organization-header" className="vaults-header">
          <div>
            <h1 className="page-title">{organization.name}</h1>
          </div>
        </header>
      )}
      {organizations.length > 1 && (
        <div id="organization-toolbar" className="org-toolbar">
          <label htmlFor="organization" className="label">
            {t("organization")}
          </label>
          <select
            id="organization"
            className="input"
            value={selectedId}
            disabled={busy}
            onChange={(event) => {
              const id = event.target.value;
              setSelectedId(id);
              setOrganization(null);
              setInviteUrl("");
              void perform(async () => {}, id);
            }}
          >
            {organizations.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </div>
      )}
      {inviteUrl && organization && (
        <div id="invite-result" className="org-panel">
          <p>{t("copyLink")}</p>
          <input
            className="input"
            aria-label={t("inviteLink")}
            readOnly
            value={inviteUrl}
            onFocus={(event) => event.currentTarget.select()}
          />
        </div>
      )}
      <Status {...status} className="status--bar" />
      <div id="detail" className="org-detail">
        {organization && props && (
          <>
            <section className="org-panel org-summary">
              {!organization.sharing.enabled && (
                <p className="org-warning">
                  {t(
                    organization.vaults.some((vault) => vault.shared)
                      ? "suspended"
                      : "sharingRequired",
                  )}
                </p>
              )}
              {billingUrl && (
                <a href={billingUrl} className="org-billing">
                  {t("billing")}
                </a>
              )}
              <details className="org-settings">
                <summary>{t("rename")}</summary>
                <form
                  className="org-inline"
                  key={`${organization.id}:${organization.name}`}
                  onSubmit={(event) => {
                    event.preventDefault();
                    const name = new FormData(event.currentTarget).get("name");
                    void perform(() => api("", "PATCH", { name }));
                  }}
                >
                  <Field label={t("name")}>
                    <input
                      className="input"
                      name="name"
                      defaultValue={organization.name}
                      maxLength={100}
                      required
                      disabled={busy}
                    />
                  </Field>
                  <button
                    type="submit"
                    className="btn btn--secondary btn--compact"
                    disabled={busy}
                  >
                    {t("rename")}
                  </button>
                </form>
              </details>
            </section>
            <Members {...props} />
            <Invitations
              key={organization.id}
              {...props}
              onInvite={setInviteUrl}
            />
            <section className="org-vaults">
              <h2 className="org-section-title">{t("vaults")}</h2>
              {organization.vaults.some(
                (vault) =>
                  vault.status === "pending_key" ||
                  vault.members.some(
                    (member) => member.status === "pending_key",
                  ),
              ) && <p className="org-help">{t("keyHelp")}</p>}
              {organization.vaults.map((vault) => (
                <section key={vault.id} className="org-panel org-vault">
                  <h3 className="org-heading">{vault.name}</h3>
                  <p className="vault-meta">
                    {t("yourAccess")}: {t(vault.status ?? "noAccess")}
                  </p>
                  {vault.shared && !organization.sharing.enabled && (
                    <p className="org-warning">{t("suspended")}</p>
                  )}
                  {vault.members.map((member) => (
                    <div
                      key={member.userId ?? member.email}
                      className="org-row"
                    >
                      <div className="org-person">
                        {member.email} · {t(member.status)}
                      </div>
                    </div>
                  ))}
                </section>
              ))}
              {!organization.vaults.length && (
                <p className="org-panel">{t("noVaults")}</p>
              )}
            </section>
            {organization.role !== "owner" && user && (
              <ActionButton
                danger
                busy={busy}
                onClick={() => {
                  if (!confirm(t("removeConfirm"))) return;
                  void perform(async () => {
                    await api(
                      `/members/${encodeURIComponent(user.id)}`,
                      "DELETE",
                    );
                    setOrganization(null);
                    location.assign(localUrl("/organizations", locale));
                  });
                }}
              >
                {t("leave")}
              </ActionButton>
            )}
          </>
        )}
      </div>
    </main>
  );
}
function ActionButton({
  children,
  danger,
  busy,
  onClick,
}: {
  children: ReactNode;
  danger?: boolean;
  busy: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={busy}
      className={`btn btn--compact btn--${danger ? "danger" : "secondary"}`}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
function Members({ organization, busy, t, perform, api }: ManagementProps) {
  return (
    <section className="org-panel org-members">
      <div className="org-panel-heading">
        <h2 className="org-heading">{t("members")}</h2>
        <span className="org-count">{organization.members.length}</span>
      </div>
      {organization.members.map((member) => (
        <div key={member.id} className="org-row">
          <div className="org-person">
            <div className="org-person-info">
              <span className="org-person-name">{member.name}</span>
              <span className="vault-meta">{member.email}</span>
            </div>
          </div>
          {member.role === "owner" || organization.role !== "owner" ? (
            <span className="org-role">{t(member.role)}</span>
          ) : (
            <select
              aria-label={t("role")}
              className="input"
              disabled={busy}
              value={member.role}
              onChange={(event) => {
                const role = event.target.value;
                void perform(() =>
                  api(`/members/${encodeURIComponent(member.id)}`, "PATCH", {
                    role,
                  }),
                );
              }}
            >
              {(["member", "admin"] as const).map((role) => (
                <option key={role} value={role}>
                  {t(role)}
                </option>
              ))}
            </select>
          )}
          {member.role !== "owner" &&
            (organization.role === "owner" || member.role === "member") && (
              <ActionButton
                busy={busy}
                danger
                onClick={() => {
                  if (!confirm(t("removeConfirm"))) return;
                  void perform(async () => {
                    const result = await api<{ pending?: boolean }>(
                      `/members/${encodeURIComponent(member.id)}`,
                      "DELETE",
                    );
                    return t(result.pending ? "pendingRefresh" : "saved");
                  });
                }}
              >
                {t("remove")}
              </ActionButton>
            )}
        </div>
      ))}
    </section>
  );
}
function Invitations({
  organization,
  busy,
  t,
  perform,
  api,
  onInvite,
}: ManagementProps & { onInvite: (url: string) => void }) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("member");
  const pending = organization.invitations.filter(
    (invitation) => invitation.status === "pending",
  );
  async function send(suffix: string, body?: unknown) {
    const result = await api<{ url: string; emailSent: boolean }>(
      suffix,
      "POST",
      body,
    );
    onInvite(result.url);
    setEmail("");
    return t(result.emailSent ? "sent" : "copyLink");
  }
  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    void perform(() => send("/invitations", { email, role }));
  }
  if (!organization.sharing.enabled && !pending.length) return null;
  return (
    <section className="org-panel org-invitations">
      {organization.sharing.enabled && (
        <details className="org-invite-disclosure">
          <summary>{t("invite")}</summary>
          <form className="org-form" onSubmit={submit}>
            <Field label={t("email")}>
              <input
                type="email"
                autoComplete="email"
                placeholder="name@example.com"
                required
                className="input"
                value={email}
                disabled={busy}
                onChange={(event) => setEmail(event.target.value)}
              />
            </Field>
            <Field label={t("organizationRole")}>
              <select
                className="input"
                value={role}
                disabled={busy}
                onChange={(event) => setRole(event.target.value as Role)}
              >
                <option value="member">{t("member")}</option>
                {organization.role === "owner" && (
                  <option value="admin">{t("admin")}</option>
                )}
              </select>
            </Field>
            <button type="submit" className="btn btn--primary" disabled={busy}>
              {t("invite")}
            </button>
          </form>
        </details>
      )}
      {pending.length > 0 && (
        <h3 className="org-list-title">{t("invitations")}</h3>
      )}
      {pending.map((invitation) => {
        const expired = new Date(invitation.expiresAt).getTime() <= Date.now();
        return (
          <div key={invitation.id} className="org-row">
            <span className="org-person">
              {invitation.email} · {t(expired ? "expired" : "pending")}
            </span>
            {!expired && organization.sharing.enabled && (
              <ActionButton
                busy={busy}
                onClick={() =>
                  void perform(() =>
                    send(
                      `/invitations/${encodeURIComponent(invitation.id)}/resend`,
                    ),
                  )
                }
              >
                {t("resend")}
              </ActionButton>
            )}
            <ActionButton
              busy={busy}
              onClick={() =>
                void perform(() =>
                  api(
                    `/invitations/${encodeURIComponent(invitation.id)}/cancel`,
                    "POST",
                  ),
                )
              }
            >
              {t("cancel")}
            </ActionButton>
          </div>
        );
      })}
    </section>
  );
}
