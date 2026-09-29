import { VaultIcon } from "../components/vault-icon";
import { useCallback, useEffect, useRef, useState } from "react";
import { Brand, BusyButton, LoadingSkeleton, Status, type StatusValue } from "../components/common";
import {
  CreateVaultDialog,
  DeleteVaultDialog,
  loadVaultCrypto,
} from "../components/vault-dialogs";
import { ApiError, getSession, request, signOut, type User } from "../lib/api";
import { localUrl, signIn } from "../lib/navigation";
import {
  canManage,
  organizationPath,
  type Organization,
  type OrganizationSummary,
} from "../lib/organizations";
import type { PageProps, Translator } from "../lib/i18n";

export interface Vault {
  id: string;
  name: string;
  organizationId: string;
  createdAt: string;
  deletionStatus?: string | null;
  deletionError?: string | null;
}
const isDeleting = (vault: Vault) =>
  vault.deletionStatus === "queued" || vault.deletionStatus === "running";
export function VaultsPage({ t, locale }: PageProps<"vaults">) {
  const [user, setUser] = useState<User | null>(null);
  const [organizations, setOrganizations] = useState<OrganizationSummary[]>([]);
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [selectedId, setSelectedId] = useState(
    () => new URLSearchParams(location.search).get("organizationId") ?? "",
  );
  const selectedRef = useRef(selectedId);
  const [vaults, setVaults] = useState<Vault[]>([]);
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  const [backgroundLoading, setBackgroundLoading] = useState(false);
  const [refreshRequired, setRefreshRequired] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [status, setStatus] = useState<StatusValue>({ message: t("loading") });
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<Vault | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);
  const organizationRef = useRef(organization);
  organizationRef.current = organization;
  const activeRequest = useRef<AbortController | null>(null);
  const loadVaults = useCallback(
    async (successMessage?: string, background = false) => {
      activeRequest.current?.abort();
      const controller = new AbortController();
      activeRequest.current = controller;
      const options = {
        fallback: t("unableToLoadVaults"),
        signal: controller.signal,
      };
      setLoading(true);
      setBackgroundLoading(background);
      if (!background) setStatus({ message: t("loading") });
      try {
        const result = await request<{ organizations: OrganizationSummary[] }>(
          "/v1/organizations",
          options,
        );
        if (controller.signal.aborted) return;
        const visible = result.organizations.filter(canManage);

        const id =
          visible.find((item) => item.id === selectedRef.current)?.id ??
          visible[0]?.id ??
          "";
        selectedRef.current = id;
        setSelectedId(id);
        let items: Vault[] = [];
        let nextOrganization: Organization | null = null;
        if (id) {
          const detail = await request<Organization>(
            organizationPath(id),
            options,
          );
          if (controller.signal.aborted) return;
          if (canManage(detail)) {
            const result = await request<{ vaults: Vault[] }>(
              "/v1/vaults?includeDeleting=true",
              options,
            );
            if (controller.signal.aborted) return;
            nextOrganization = detail;
            items = result.vaults.filter(
              (vault) => vault.organizationId === id,
            );
          }
        }
        setOrganizations(nextOrganization ? visible : []);
        setOrganization(nextOrganization);
        setVaults(items);
        setLoaded(true);
        setRefreshRequired(false);
        setStatus({
          message:
            successMessage ??
            (items.length === 1
              ? t("countOne")
              : t("countMany", { count: items.length })),
        });
      } catch (error) {
        if (!controller.signal.aborted) {
          setSelectedId(organizationRef.current?.id ?? "");
          selectedRef.current = organizationRef.current?.id ?? "";
          if (successMessage) setRefreshRequired(true);
          setStatus({
            message:
              successMessage
                ? `${successMessage} ${t("refreshFailed")}`
                : error instanceof ApiError ? error.message : t("apiUnavailable"),
            tone: "error",
          });
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    },
    [t],
  );
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setStatus({ message: t("loading") });
    void getSession(t("apiUnavailable"), controller.signal)
      .then(async (session) => {
        if (controller.signal.aborted) return;
        if (!session?.user) {
          signIn(locale);
          return;
        }
        setUser(session.user);
        await loadVaults();
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setStatus({ message: t("apiUnavailable"), tone: "error" });
          setLoading(false);
        }
      });
    return () => {
      controller.abort();
      activeRequest.current?.abort();
    };
  }, [t, locale, loadVaults, retry]);
  useEffect(() => {
    if (loading || creating || deleting || !vaults.some(isDeleting)) return;
    const timer = setTimeout(() => void loadVaults(undefined, true), 2500);
    return () => clearTimeout(timer);
  }, [vaults, loading, creating, deleting, loadVaults]);
  async function logout() {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await signOut(t("unableToSignOut"));
      signIn(locale);
    } catch (error) {
      setStatus({
        message:
          error instanceof ApiError ? error.message : t("apiUnavailable"),
        tone: "error",
      });
      setLoggingOut(false);
    }
  }
  const switching = Boolean(organization && selectedId !== organization.id);
  const showSkeleton = loading && (!loaded || switching);
  function createdDate(vault: Vault) {
    const date = new Date(vault.createdAt);
    const formatted = Number.isNaN(date.getTime())
      ? t("unknown")
      : new Intl.DateTimeFormat(locale, {
          year: "numeric",
          month: "short",
          day: "numeric",
        }).format(date);
    return t("created", { date: formatted });
  }
  return (
    <>
      <main className="page page--wide management-page">
        <div className="topbar management-topbar">
          <Brand />
          {user && (
            <div id="user-container" className="user-area">
              <div id="user" className="user-badge">
                {user.email || user.name || t("signedIn")}
              </div>
              <BusyButton
                busy={loggingOut}
                id="logout"
                type="button"
                className="signout-button"
                disabled={loggingOut}
                onClick={() => void logout()}
              >
                {t("signOut")}
              </BusyButton>
            </div>
          )}
        </div>
        <header className="vaults-header">
          <div>
            <h1 className="page-title">{t("title")}</h1>
            <p className="vaults-subtitle">{t("subtitle")}</p>
          </div>
        </header>
        {organizations.length > 0 && (
          <div id="organization-toolbar" className="org-toolbar">
            <label htmlFor="organization" className="label">
              {t("organization")}
            </label>
            <select
              id="organization"
              className="input"
              disabled={loading || creating || Boolean(deleting)}
              value={selectedId}
              onChange={(event) => {
                selectedRef.current = event.target.value;
                setSelectedId(event.target.value);
                void loadVaults();
              }}
            >
              {organizations.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
            {organization && (
              <a
                id="organizations-link"
                className="management-link"
                href={localUrl("/organizations", locale, {
                  organizationId: organization.id,
                })}
              >
                {t("organizations")}
              </a>
            )}
          </div>
        )}
        <div className="vaults-toolbar">
          <Status {...status} className="status--bar" />
          <div className="vaults-actions">
            <BusyButton
              busy={loading && !backgroundLoading}
              id="refresh"
              type="button"
              className="btn btn--secondary btn--compact btn--fluid"
              disabled={loading}
              onClick={() => user ? void loadVaults() : setRetry((value) => value + 1)}
            >
              {t("refresh")}
            </BusyButton>
            <button
              id="create-vault"
              type="button"
              className="btn btn--primary btn--compact btn--fluid"
              disabled={loading || refreshRequired || !canManage(organization)}
              onClick={() => {
                setCreating(true);
                void loadVaultCrypto().catch(() => {});
              }}
            >
              {t("createVault")}
            </button>
          </div>
        </div>
        <section id="vault-list" className="vault-list" aria-busy={loading}>
          {showSkeleton && <LoadingSkeleton />}
          {!showSkeleton && vaults.map((vault) => (
            <article key={vault.id} className={`vault-card${vault.deletionStatus === "failed" ? " vault-card--failed" : ""}`}>
              <VaultIcon />
              <div className="vault-info">
                <h2 className="vault-name">{vault.name}</h2>
                <p className="vault-meta">{createdDate(vault)}</p>
                {vault.deletionStatus && (
                  <p className={`vault-deletion-status access-status ${vault.deletionStatus === "failed" ? "access-status--revoked" : "access-status--pending_key"}`}>
                    {t("deletionStatus", { status: vault.deletionStatus })}
                  </p>
                )}
                {vault.deletionError && (
                  <p className="form-error">{vault.deletionError}</p>
                )}
              </div>
              {canManage(organization) && (
                <button
                  type="button"
                  className="btn btn--danger btn--compact vault-delete"
                  disabled={loading || refreshRequired || isDeleting(vault)}
                  onClick={() => setDeleting(vault)}
                >
                  {t(isDeleting(vault) ? "deleting" : "delete")}
                </button>
              )}
            </article>
          ))}
        </section>
        {loaded && !showSkeleton && !vaults.length && (
          <section id="empty-guide">
            {organization ? <EmptyGuide t={t} /> : (
              <div className="management-empty">
                <VaultIcon />
                <h2 className="empty-guide-title">{t("noManagedOrganization")}</h2>
                <p>{t("noManagedOrganizationHelp")}</p>
              </div>
            )}
          </section>
        )}
      </main>
      {creating && organization && (
        <CreateVaultDialog
          t={t}
          organizationId={organization.id}
          onClose={() => setCreating(false)}
          onSuccess={(name) => {
            setCreating(false);
            void loadVaults(t("createdVault", { name }));
          }}
        />
      )}
      {deleting && (
        <DeleteVaultDialog
          t={t}
          vault={deleting}
          onClose={() => setDeleting(null)}
          onSuccess={(name) => {
            setDeleting(null);
            void loadVaults(t("queuedForDeletion", { name }));
          }}
        />
      )}
    </>
  );
}
function EmptyGuide({ t }: { t: Translator<"vaults"> }) {
  const steps = [
    ["emptyGuideInstallTitle", "emptyGuideInstallBody"],
    ["emptyGuideSignInTitle", "emptyGuideSignInBody"],
    ["emptyGuideCreateTitle", "emptyGuideCreateBody"],
    ["emptyGuidePasswordTitle", "emptyGuidePasswordBody"],
    ["emptyGuideDeviceTitle", "emptyGuideDeviceBody"],
  ] as const;
  return (
    <section className="empty-guide">
      <div className="empty-guide-header">
        <p className="empty-guide-eyebrow">{t("empty")}</p>
        <h2 className="empty-guide-title">{t("emptyGuideTitle")}</h2>
        <p className="empty-guide-intro">{t("emptyGuideIntro")}</p>
      </div>
      <ol className="empty-guide-steps">
        {steps.map(([title, body], index) => (
          <li key={title} className="empty-guide-step">
            <div className="step-marker">{index + 1}</div>
            <div className="step-content">
              <h3 className="step-title">{t(title)}</h3>
              <p className="step-body">{t(body)}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
