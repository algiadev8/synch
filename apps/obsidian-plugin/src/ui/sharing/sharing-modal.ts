import { App, Modal, Notice, Setting, setIcon } from "obsidian";
import {
  SharingManager,
  type SharingVault,
  type VaultKeyRequest,
  type RemoteVaultSession,
} from "@synch/sync-client/remote";
import { t } from "../../i18n";

export class SharingModal extends Modal {
  private closed = false;
  private busy = false;
  constructor(
    app: App,
    private readonly manager: SharingManager,
    private readonly activeSession: () => RemoteVaultSession | null,
    private readonly isCurrentAccount: () => boolean,
    private readonly openOrganizations: () => void,
  ) {
    super(app);
  }
  onOpen(): void {
    this.modalEl.addClass("synch-sharing-modal");
    this.contentEl.addClass("synch-sharing");
    void this.refresh();
  }
  onClose(): void {
    this.closed = true;
    this.contentEl.empty();
  }
  private async run(action: () => Promise<void>): Promise<void> {
    if (this.busy || this.closed) return;
    if (!this.isCurrentAccount()) {
      new Notice(t("sharing.accountChanged"));
      this.close();
      return;
    }
    this.busy = true;
    this.contentEl.querySelectorAll("button").forEach((button) => {
      button.disabled = true;
    });
    try {
      await action();
    } catch (error) {
      new Notice(error instanceof Error ? error.message : String(error), 10000);
    } finally {
      this.busy = false;
      if (!this.closed) await this.refresh();
    }
  }
  private async refresh(): Promise<void> {
    if (this.closed) return;
    this.contentEl.empty();
    this.contentEl.createEl("h2", { text: t("sharing.title") });
    const body = this.contentEl.createDiv();
    body.setAttribute("aria-live", "polite");
    const loading = body.createEl("p", { text: t("sharing.loading"), cls: "synch-sharing-hint" });
    const footer = this.contentEl.createDiv({ cls: "synch-sharing-footer" });
    new Setting(footer).addButton((button) => {
      button.setButtonText(t("sharing.organizations")).onClick(this.openOrganizations);
      button.buttonEl.addClass("synch-sharing-web-link");
      setIcon(button.buttonEl.createSpan(), "arrow-up-right");
    });
    new Setting(footer).addButton((button) =>
      button.setButtonText(t("sharing.refresh")).onClick(() => {
        void this.run(async () => {});
      }),
    );
    try {
      const organizations = await this.manager.client.organizations();
      if (this.closed) return;
      loading.remove();
      let vaultCount = 0;
      for (const organization of organizations) {
        const vaults = organization.vaults.filter(
          (vault) =>
            vault.status === "active" || vault.status === "pending_key",
        );
        if (!vaults.length) continue;
        vaultCount += vaults.length;
        for (const vault of vaults) {
          try {
            await this.renderVault(body, vault, organization.sharing.enabled, organization.name);
            if (this.closed) return;
          } catch (error) {
            body.createEl("p", {
              text: error instanceof Error ? error.message : String(error),
            });
          }
        }
      }
      if (!vaultCount) body.createEl("p", { text: t("sharing.noVaults"), cls: "synch-sharing-empty" });
    } catch (error) {
      if (this.closed) return;
      loading.remove();
      body.createEl("p", {
        text: error instanceof Error ? error.message : String(error),
      });
    }
  }
  private async renderVault(
    parent: HTMLElement,
    vault: SharingVault,
    canShare: boolean,
    organizationName: string,
  ): Promise<void> {
    const section = parent.createDiv({ cls: "synch-sharing-vault" });
    const header = section.createDiv({ cls: "synch-sharing-vault-header" });
    setIcon(header.createSpan({ cls: "synch-sharing-vault-icon" }), "vault");
    const heading = header.createDiv({ cls: "synch-sharing-vault-heading" });
    heading.createEl("h3", { text: vault.name });
    heading.createEl("p", { text: organizationName, cls: "synch-sharing-hint" });
    const key =
      this.activeSession()?.summary.vaultId === vault.id
        ? this.activeSession()?.remoteVaultKey
        : undefined;
    header.createSpan({
      text: t(vault.status === "pending_key" ? "sharing.accessNeeded" : key ? "sharing.connected" : "sharing.notConnected"),
      cls: "synch-sharing-badge",
    });
    const access = section.createDiv({ cls: "synch-sharing-panel" });
    if (!canShare) {
      access.createEl("p", { text: t(vault.shared ? "sharing.suspended" : "sharing.unavailable"), cls: "synch-sharing-empty" });
      return;
    }
    if (vault.status === "pending_key") {
      access.createEl("p", { text: t("sharing.connectToSetUp"), cls: "synch-sharing-hint" });
      return;
    }
    const requests = await this.manager.client.requests(vault.id);
    if (this.closed) return;
    let visibleRequests = 0;
    for (const request of requests) {
      if (request.userId !== this.manager.userId && request.status === "pending" && vault.canManage) {
        visibleRequests++;
        this.approvalForm(access, vault, request, key);
      }
    }
    if (!visibleRequests && vault.status === "active") {
      const empty = access.createDiv({ cls: "synch-sharing-empty" });
      setIcon(empty.createSpan(), "users");
      empty.createEl("p", { text: t("sharing.noRequests") });
    }
  }
  private approvalForm(
    parent: HTMLElement,
    vault: SharingVault,
    request: VaultKeyRequest,
    key?: Uint8Array,
  ): void {
    const member = vault.members.find(
      (member) => member.userId === request.userId,
    );
    const setting = new Setting(parent)
      .setName(
        `${member?.email ?? request.userId} · ${t(request.purpose === "recovery" ? "sharing.recovery" : "sharing.setup")}`,
      )
      .setDesc(t(key ? "sharing.approveHelp" : "sharing.connectFirst"));
    if (!key) return;
    let code = "";
    setting.addText((text) =>
      text.setPlaceholder(t("sharing.code")).onChange((value) => {
        code = value;
      }),
    );
    setting.addButton((button) =>
      button.setButtonText(t("sharing.approve")).onClick(() => {
        void this.run(() => this.manager.approve(request, key, code));
      }),
    );
  }
}
