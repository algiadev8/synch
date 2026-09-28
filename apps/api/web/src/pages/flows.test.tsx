import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthPage } from "./auth";
import { DevicePage } from "./device";
import { InvitationsPage } from "./invitations";
import { OrganizationsPage } from "./organizations";
import { VaultsPage } from "./vaults";
import {
  CreateVaultDialog,
  DeleteVaultDialog,
} from "../components/vault-dialogs";
import { translator } from "../lib/i18n";
import * as navigation from "../lib/navigation";
import type { Organization } from "../lib/organizations";

const cryptoMock = vi.hoisted(() => ({
  validateVaultPassword: vi.fn(),
  createPasswordWrappedRemoteVaultKey: vi.fn(),
}));
vi.mock("../../vendor/vault-crypto.js", () => cryptoMock);
const session = {
  user: { id: "user-1", email: "owner@example.com", name: "Owner" },
};
const organization: Organization = {
  id: "org-1",
  name: "My organization",
  role: "owner",
  sharing: { enabled: true },
  members: [
    { ...session.user, role: "owner" },
    {
      id: "user-2",
      email: "member@example.com",
      name: "Member",
      role: "member",
    },
  ],
  invitations: [],
  vaults: [],
};
const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>;
beforeEach(() => {
  fetchMock = vi.fn<typeof fetch>();
  vi.stubGlobal("fetch", fetchMock);
  cryptoMock.validateVaultPassword.mockReset().mockReturnValue({ ok: true });
  cryptoMock.createPasswordWrappedRemoteVaultKey.mockReset();
});

describe("authentication", () => {
  it("keeps the callback URL and disables verification resend during cooldown", async () => {
    history.replaceState(
      null,
      "",
      "/signin?return_to=%2Fdevice%3Fuser_code%3DABCD&lang=ko",
    );
    fetchMock.mockImplementation(async (input) =>
      String(input).includes("get-session")
        ? json(null)
        : String(input).includes("sign-in/email")
          ? json(
              { code: "EMAIL_NOT_VERIFIED", message: "Email not verified" },
              403,
            )
          : json({ ok: true }),
    );
    const t = await translator<"signin" | "signup">("signin", "en");
    render(<AuthPage mode="signin" t={t} locale="ko" />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Email"), "owner@example.com");
    await user.type(screen.getByLabelText("Password"), "account-password");
    await user.click(screen.getByRole("button", { name: "Sign In" }));
    await screen.findByText("Email verification required");
    const auth = fetchMock.mock.calls.find(([url]) =>
      String(url).includes("sign-in/email"),
    )!;
    expect(JSON.parse(String(auth[1]?.body))).toMatchObject({
      callbackURL: "http://localhost:3000/device?user_code=ABCD",
    });
    expect((screen.getByLabelText("Email") as HTMLInputElement).disabled).toBe(
      true,
    );
    expect(
      (
        screen.getByRole("button", {
          name: /Resend available/,
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    const signup = screen.getByRole("link", { name: "Sign up" });
    expect(
      new URL(signup.getAttribute("href")!).searchParams.get("return_to"),
    ).toContain("/device?user_code=ABCD");
  });
  it("shows the verification state for signup without a session token", async () => {
    fetchMock.mockResolvedValue(json({ token: null }));
    render(
      <AuthPage
        mode="signup"
        t={await translator<"signin" | "signup">("signup", "en")}
        locale="en"
      />,
    );
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Name"), "New User");
    await user.type(screen.getByLabelText("Email"), "new@example.com");
    await user.type(screen.getByLabelText("Password"), "account-password");
    await user.click(screen.getByRole("button", { name: "Create Account" }));
    await screen.findByText("Check your email");
    expect(
      (screen.getByRole("button", { name: "Email Sent" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });
});

describe("device approval", () => {
  it("requires an explicit approval and exposes only the supported return URI", async () => {
    history.replaceState(
      null,
      "",
      "/device?user_code=abcd-efgh&return_uri=obsidian%3A%2F%2Fsynch-device-login",
    );
    fetchMock.mockImplementation(async (input) =>
      String(input).includes("get-session")
        ? json(session)
        : String(input).includes("?")
          ? json({ status: "pending" })
          : json({ ok: true }),
    );
    render(<DevicePage t={await translator("device", "en")} locale="en" />);
    const approve = await screen.findByRole("button", {
      name: "Allow Obsidian sign-in",
    });
    expect(
      fetchMock.mock.calls.every(([, init]) => init?.method !== "POST"),
    ).toBe(true);
    await userEvent.click(approve);
    const link = await screen.findByRole("link", {
      name: "Return to Obsidian",
    });
    expect(link.getAttribute("href")).toBe("obsidian://synch-device-login");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/auth/device/approve",
      expect.objectContaining({
        body: JSON.stringify({ userCode: "ABCDEFGH" }),
      }),
    );
    expect(
      screen.queryByRole("button", { name: "Allow Obsidian sign-in" }),
    ).toBeNull();
  });
  it("returns unauthenticated device users to sign-in", async () => {
    fetchMock.mockResolvedValue(json(null));
    const redirect = vi
      .spyOn(navigation, "signIn")
      .mockImplementation(() => {});
    render(<DevicePage t={await translator("device", "en")} locale="ko" />);
    await waitFor(() => expect(redirect).toHaveBeenCalledWith("ko"));
    expect(screen.queryByRole("button")).toBeNull();
  });
});

describe("vault safety", () => {
  it("creates using only the wrapped key envelope and prevents duplicate submits", async () => {
    const envelope = {
      version: 1,
      kdf: { name: "argon2id" },
      wrap: { ciphertext: "encrypted" },
    };
    const rawKey = new Uint8Array([1, 2, 3]);
    let finish!: (value: {
      envelope: typeof envelope;
      remoteVaultKey: Uint8Array;
    }) => void;
    cryptoMock.createPasswordWrappedRemoteVaultKey.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    fetchMock.mockResolvedValue(json({ id: "vault-1" }));
    const success = vi.fn();
    const close = vi.fn();
    render(
      <CreateVaultDialog
        organizationId="org-1"
        t={await translator("vaults", "en")}
        onClose={close}
        onSuccess={success}
      />,
    );
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Vault name"), "Vault");
    await user.type(
      screen.getByLabelText("Vault password"),
      "secret-vault-passphrase",
    );
    await user.type(
      screen.getByLabelText("Confirm vault password"),
      "secret-vault-passphrase",
    );
    await user.click(screen.getByRole("button", { name: "Create vault" }));
    expect(
      (screen.getByRole("button", { name: "Creating..." }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    fireEvent.submit(screen.getByRole("dialog").querySelector("form")!);
    fireEvent(
      screen.getByRole("dialog"),
      new Event("cancel", { cancelable: true }),
    );
    expect(close).not.toHaveBeenCalled();
    await act(async () => finish({ envelope, remoteVaultKey: rawKey }));
    await waitFor(() => expect(success).toHaveBeenCalledWith("Vault"));
    expect(
      cryptoMock.createPasswordWrappedRemoteVaultKey,
    ).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({
      name: "Vault",
      organizationId: "org-1",
      initialWrapper: { kind: "password", envelope },
    });
    expect([...rawKey]).toEqual([0, 0, 0]);
  });
  it("rejects password mismatches without creating or uploading a key", async () => {
    render(
      <CreateVaultDialog
        organizationId="org-1"
        t={await translator("vaults", "en")}
        onClose={() => {}}
        onSuccess={() => {}}
      />,
    );
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Vault name"), "Vault");
    await user.type(
      screen.getByLabelText("Vault password"),
      "correct-passphrase",
    );
    await user.type(
      screen.getByLabelText("Confirm vault password"),
      "different-passphrase",
    );
    await user.click(screen.getByRole("button", { name: "Create vault" }));
    await screen.findByText("Passwords do not match.");
    expect(
      cryptoMock.createPasswordWrappedRemoteVaultKey,
    ).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("requires the exact vault name and leaves the dialog usable after deletion fails", async () => {
    fetchMock
      .mockResolvedValueOnce(json({ message: "Try again" }, 503))
      .mockResolvedValueOnce(json({ ok: true }));
    const success = vi.fn();
    render(
      <DeleteVaultDialog
        vault={{
          id: "vault-1",
          name: "My Vault",
          organizationId: "org-1",
          createdAt: "2026-01-01",
        }}
        t={await translator("vaults", "en")}
        onClose={() => {}}
        onSuccess={success}
      />,
    );
    const button = screen.getByRole("button", {
      name: "Delete permanently",
    }) as HTMLButtonElement;
    const input = screen.getByLabelText("Type the vault name to confirm");
    const user = userEvent.setup();
    await user.type(input, "My vault");
    expect(button.disabled).toBe(true);
    await user.clear(input);
    await user.type(input, "My Vault");
    await user.click(button);
    await screen.findByText("Try again");
    expect(button.disabled).toBe(false);
    expect(success).not.toHaveBeenCalled();
    await user.click(button);
    await waitFor(() => expect(success).toHaveBeenCalledWith("My Vault"));
  });
  it("only lists vaults in the selected organization and disables queued deletions", async () => {
    fetchMock.mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("get-session")) return json(session);
      if (url === "/v1/organizations")
        return json({ organizations: [organization] });
      if (url.includes("/v1/organizations/")) return json(organization);
      return json({
        vaults: [
          {
            id: "v1",
            name: "Visible",
            organizationId: "org-1",
            createdAt: "2026-01-01",
            deletionStatus: "queued",
          },
          {
            id: "v2",
            name: "Other organization",
            organizationId: "org-2",
            createdAt: "2026-01-01",
          },
        ],
      });
    });
    render(<VaultsPage t={await translator("vaults", "en")} locale="en" />);
    await screen.findByText("Visible");
    expect(screen.queryByText("Other organization")).toBeNull();
    expect(
      (screen.getByRole("button", { name: "Deleting" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });
});

describe("organization management", () => {
  it("preserves role controls and exposes generated invitation links", async () => {
    fetchMock.mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.includes("get-session")) return json(session);
      if (url === "/v1/organizations")
        return json({ organizations: [organization] });
      if (init?.method === "POST")
        return json({
          url: "http://localhost:3000/invitations?invitationId=invite-1",
          emailSent: false,
        });
      return json(organization);
    });
    render(
      <OrganizationsPage
        t={await translator("organizations", "en")}
        locale="en"
      />,
    );
    await screen.findByRole("heading", { name: "My organization" });
    expect(screen.getAllByRole("combobox", { name: "Role" })).toHaveLength(1);
    const user = userEvent.setup();
    await user.click(
      screen.getByText("Invite member", { selector: "summary" }),
    );
    await user.type(
      screen.getByLabelText("Email address"),
      "invited@example.com",
    );
    await user.click(screen.getByRole("button", { name: "Invite member" }));
    const link = (await screen.findByLabelText(
      "Invitation link",
    )) as HTMLInputElement;
    expect(link.value).toContain("invitationId=invite-1");
    const call = fetchMock.mock.calls.find(
      ([, init]) => init?.method === "POST",
    )!;
    expect(JSON.parse(String(call[1]?.body))).toEqual({
      email: "invited@example.com",
      role: "member",
    });
    const ownerRow = screen.getByText("owner@example.com").closest(".org-row")!;
    expect(within(ownerRow as HTMLElement).queryByRole("button")).toBeNull();
  });
  it("accepts invitations and points to the accepted organization", async () => {
    history.replaceState(null, "", "/invitations?invitationId=invite-1");
    fetchMock.mockImplementation(async (input, init) =>
      String(input).includes("get-session")
        ? json(session)
        : init?.method === "POST"
          ? json({ organizationId: "org-1" })
          : json({
              organizationId: "org-1",
              organizationName: "Team",
              role: "member",
              status: "pending",
              vaults: [],
            }),
    );
    render(
      <InvitationsPage t={await translator("invitations", "en")} locale="en" />,
    );
    await userEvent.click(
      await screen.findByRole("button", { name: "Accept invitation" }),
    );
    await screen.findByText(
      "Invitation accepted. Continue key setup in Obsidian.",
    );
    expect(
      screen
        .getByRole("link", { name: "Manage organization" })
        .getAttribute("href"),
    ).toContain("organizationId=org-1");
    expect(
      screen.queryByRole("button", { name: "Reject invitation" }),
    ).toBeNull();
  });
  it("allows switching accounts when an invitation is unavailable", async () => {
    history.replaceState(null, "", "/invitations?invitationId=invite-1");
    const redirect = vi
      .spyOn(navigation, "signIn")
      .mockImplementation(() => {});
    fetchMock.mockImplementation(async (input, init) =>
      String(input).includes("get-session")
        ? json(session)
        : init?.method === "POST"
          ? json({ ok: true })
          : json({ message: "Forbidden" }, 403),
    );
    render(
      <InvitationsPage t={await translator("invitations", "en")} locale="en" />,
    );
    await screen.findByText(/This invitation is unavailable for this account/);
    await userEvent.click(
      screen.getByRole("button", { name: "Switch account" }),
    );
    await waitFor(() => expect(redirect).toHaveBeenCalledWith("en"));
  });
});
